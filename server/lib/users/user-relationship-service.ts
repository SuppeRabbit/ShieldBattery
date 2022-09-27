import { singleton } from 'tsyringe'
import { NotificationType } from '../../../common/notifications'
import {
  MAX_BLOCKS,
  MAX_FRIENDS,
  toUserRelationshipJson,
  UserRelationship,
  UserRelationshipEvent,
  UserRelationshipKind,
  UserRelationshipServiceErrorCode,
  UserRelationshipSummary,
} from '../../../common/users/relationships'
import { SbUserId } from '../../../common/users/sb-user'
import { CodedError } from '../errors/coded-error'
import logger from '../logging/logger'
import NotificationService from '../notifications/notification-service'
import { Clock } from '../time/clock'
import { UserSocketsManager } from '../websockets/socket-groups'
import { TypedPublisher } from '../websockets/typed-publisher'
import {
  acceptFriendRequest,
  blockUser,
  countBlocks,
  countFriendsAndRequests,
  getRelationshipsForUsers,
  getRelationshipSummaryForUser,
  removeFriend,
  removeFriendRequest,
  sendFriendRequest,
  unblockUser,
} from './user-relationship-models'

export class UserRelationshipServiceError extends CodedError<UserRelationshipServiceErrorCode> {}

export function getRelationshipsPath(userId: SbUserId): string {
  return `/relationships/${userId}`
}

@singleton()
export class UserRelationshipService {
  constructor(
    private clock: Clock,
    private publisher: TypedPublisher<UserRelationshipEvent>,
    private userSocketsManager: UserSocketsManager,
    private notificationService: NotificationService,
  ) {
    userSocketsManager.on('newUser', userSockets => {
      // TODO(tec27): look up friends and subscribe to their status routes/send updates for user
      // connecting/disconnecting

      // NOTE(tec27): We don't provide initial data over this as it's potentially a lot of stuff
      // to send over websockets. We instead expect that the client will get this info by making a
      // request on load (or have it placed in the DOM directly for the web version)
      userSockets.subscribe(getRelationshipsPath(userSockets.userId))
    })
  }

  private publishUpsert(userId: SbUserId, relationship: UserRelationship) {
    this.publisher.publish(getRelationshipsPath(userId), {
      type: 'upsert',
      relationship: toUserRelationshipJson(relationship),
    })
  }

  private publishDelete(toUserId: SbUserId, deletedUserId: SbUserId) {
    this.publisher.publish(getRelationshipsPath(toUserId), {
      type: 'delete',
      targetUser: deletedUserId,
    })
  }

  async sendFriendRequest(fromId: SbUserId, toId: SbUserId): Promise<UserRelationship> {
    if (fromId === toId) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.InvalidSelfAction,
        "Can't send a friend request to yourself",
      )
    }

    const numFriends = await countFriendsAndRequests(fromId, toId)
    if (numFriends >= MAX_FRIENDS) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.LimitReached,
        'Too many friends or outgoing requests, please remove some to add more',
      )
    }

    const curDate = new Date(this.clock.now())
    const relationships = await sendFriendRequest(fromId, toId, curDate)
    const fromRelationship = relationships.find(r => r.fromId === fromId)

    if (!fromRelationship) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.BlockedByUser,
        'You have been blocked by this user',
      )
    } else {
      if (fromRelationship.createdAt.getTime() === curDate.getTime()) {
        // Relationship was updated, send notifications for the change
        try {
          if (fromRelationship.kind === UserRelationshipKind.FriendRequest) {
            this.publishUpsert(fromId, fromRelationship)
            this.publishUpsert(toId, fromRelationship)

            await this.notificationService.addNotification({
              userId: toId,
              data: {
                type: NotificationType.FriendRequest,
                from: fromId,
              },
            })
          } else if (fromRelationship.kind === UserRelationshipKind.Friend) {
            this.publishUpsert(fromId, fromRelationship)
            this.publishUpsert(toId, relationships.find(r => r.fromId === toId)!)

            await Promise.all([
              this.notificationService.addNotification({
                userId: toId,
                data: {
                  type: NotificationType.FriendStart,
                  with: fromId,
                },
              }),
              this.notificationService.addNotification({
                userId: fromId,
                data: {
                  type: NotificationType.FriendStart,
                  with: toId,
                },
              }),
              this.notificationService.clearFirstMatching({
                userId: fromId,
                data: {
                  type: NotificationType.FriendRequest,
                  from: toId,
                },
              }),
            ])
          }
        } catch (err) {
          // Seems best to treat this as best-effort, since the request will still have been sent
          // to connected clients + appear in the friend request list, better to have this response
          // succeed than fail here
          logger.error({ err }, 'error managing friend request notifications')
        }
      }

      return fromRelationship
    }
  }

  async acceptFriendRequest(
    acceptingId: SbUserId,
    requestingId: SbUserId,
  ): Promise<UserRelationship> {
    if (acceptingId === requestingId) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.InvalidSelfAction,
        "Can't accept a friend request from yourself",
      )
    }

    const numFriends = await countFriendsAndRequests(acceptingId, requestingId)
    if (numFriends >= MAX_FRIENDS) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.LimitReached,
        'Too many friends or outgoing requests, please remove some to add more',
      )
    }

    const curDate = new Date(this.clock.now())
    const relationships = await acceptFriendRequest(acceptingId, requestingId, curDate)
    const acceptingRelationship = relationships.find(r => r.fromId === acceptingId)

    if (!acceptingRelationship) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.NoMatchingEntry,
        'Could not find a friend request from this user',
      )
    } else {
      if (acceptingRelationship.createdAt.getTime() === curDate.getTime()) {
        // Relationship was updated, send notifications for the change
        try {
          if (acceptingRelationship.kind === UserRelationshipKind.Friend) {
            this.publishUpsert(acceptingId, acceptingRelationship)
            this.publishUpsert(requestingId, relationships.find(r => r.fromId === requestingId)!)

            await Promise.all([
              this.notificationService.addNotification({
                userId: requestingId,
                data: {
                  type: NotificationType.FriendStart,
                  with: acceptingId,
                },
              }),
              this.notificationService.addNotification({
                userId: acceptingId,
                data: {
                  type: NotificationType.FriendStart,
                  with: requestingId,
                },
              }),
              this.notificationService.clearFirstMatching({
                userId: acceptingId,
                data: {
                  type: NotificationType.FriendRequest,
                  from: requestingId,
                },
              }),
            ])
          }
        } catch (err) {
          // Seems best to treat this as best-effort, since the request will still have been sent
          // to connected clients + appear in the friend request list, better to have this response
          // succeed than fail here
          logger.error({ err }, 'error managing accepted friend request notifications')
        }
      }

      return acceptingRelationship
    }
  }

  /**
   * Removes a friend request sent by `fromId` to `toId`. Note that this can be used for either side
   * of the request (i.e. this can be called to cancel the outgoing request, or to deny the incoming
   * request).
   */
  async removeFriendRequest(fromId: SbUserId, toId: SbUserId): Promise<void> {
    if (fromId === toId) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.InvalidSelfAction,
        "Can't remove a friend request from yourself",
      )
    }

    const wasRemoved = await removeFriendRequest(fromId, toId)

    if (!wasRemoved) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.NoMatchingEntry,
        'Could not find a friend request from this user',
      )
    } else {
      this.publishDelete(fromId, toId)
      this.publishDelete(toId, fromId)

      try {
        const notifications = await this.notificationService.retrieveNotifications({
          userId: toId,
          data: { type: NotificationType.FriendRequest, from: fromId },
          visible: true,
          limit: 1,
        })
        await Promise.all(notifications.map(n => this.notificationService.clearById(toId, n.id)))
      } catch (err) {
        logger.error({ err }, 'error while removing a friend request notification')
      }
    }
  }

  async removeFriend(removerId: SbUserId, targetId: SbUserId): Promise<void> {
    if (removerId === targetId) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.InvalidSelfAction,
        "Can't remove friendship with yourself",
      )
    }

    const wasRemoved = await removeFriend(removerId, targetId)

    if (!wasRemoved) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.NoMatchingEntry,
        'Not currently friends with that user',
      )
    } else {
      this.publishDelete(removerId, targetId)
      this.publishDelete(targetId, removerId)
    }
  }

  async blockUser(blockerId: SbUserId, targetId: SbUserId): Promise<UserRelationship> {
    if (blockerId === targetId) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.InvalidSelfAction,
        "Can't block yourself",
      )
    }

    const numBlocks = await countBlocks(blockerId, targetId)
    if (numBlocks >= MAX_BLOCKS) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.LimitReached,
        'Too many users blocked, please remove some to add more',
      )
    }

    const curDate = new Date(this.clock.now())
    const relationships = await blockUser(blockerId, targetId, curDate)
    const blockerRelationship = relationships.find(r => r.fromId === blockerId)

    if (!blockerRelationship) {
      throw new Error('Failed to find a relationship for the blocking user')
    } else if (blockerRelationship.createdAt.getTime() === curDate.getTime()) {
      this.publishUpsert(blockerId, blockerRelationship)
      if (!relationships.find(r => r.fromId === targetId)) {
        this.publishDelete(targetId, blockerId)
      }
    }

    return blockerRelationship
  }

  async unblockUser(unblockerId: SbUserId, targetId: SbUserId): Promise<void> {
    if (unblockerId === targetId) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.InvalidSelfAction,
        "Can't unblock yourself",
      )
    }

    const relationships = await unblockUser(unblockerId, targetId)
    const unblockerRelationship = relationships.find(r => r.fromId === unblockerId)
    const reverseRelationship = relationships.find(r => r.fromId === targetId)

    if (
      unblockerRelationship ||
      (reverseRelationship && reverseRelationship.kind !== UserRelationshipKind.Block)
    ) {
      throw new UserRelationshipServiceError(
        UserRelationshipServiceErrorCode.NoMatchingEntry,
        'Not currently blocking that user',
      )
    } else {
      this.publishDelete(unblockerId, targetId)
    }
  }

  async getRelationshipSummary(userId: SbUserId): Promise<UserRelationshipSummary> {
    return await getRelationshipSummaryForUser(userId)
  }

  async isUserBlocked(userId: SbUserId, targetId: SbUserId): Promise<boolean> {
    const relationships = await getRelationshipsForUsers(userId, targetId)
    return relationships.some(r => r.kind === UserRelationshipKind.Block && r.toId === userId)
  }
}
