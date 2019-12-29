import React from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { push } from 'connected-react-router'
import {
  sendMessage,
  retrieveInitialMessageHistory,
  retrieveNextMessageHistory,
  retrieveUserList,
  activateChannel,
  deactivateChannel,
  joinChannel,
} from './action-creators'
import styles from './channel.css'

import MessageInput from '../messaging/message-input.jsx'
import LoadingIndicator from '../progress/dots.jsx'
import MessageList from '../messaging/message-list.jsx'
import { ScrollableContent } from '../material/scroll-bar.jsx'

import { MULTI_CHANNEL } from '../../app/common/flags'

// Height to the bottom of the loading area (the top of the messages)
const LOADING_AREA_BOTTOM = 32 + 8

class UserListEntry extends React.Component {
  static propTypes = {
    user: PropTypes.string.isRequired,
  }

  render() {
    return <li className={styles.userListEntry}>{this.props.user}</li>
  }
}

class UserList extends React.Component {
  static propTypes = {
    users: PropTypes.object.isRequired,
  }

  shouldComponentUpdate(nextProps) {
    return this.props.users !== nextProps.users
  }

  renderSection(title, users) {
    if (!users.size) {
      return null
    }

    return (
      <div className={styles.userListSection}>
        <p className={styles.userSubheader}>{title}</p>
        <ul className={styles.userSublist}>
          {users.map(u => (
            <UserListEntry user={u} key={u} />
          ))}
        </ul>
      </div>
    )
  }

  render() {
    const { active, idle, offline } = this.props.users
    return (
      <div className={styles.userList}>
        <ScrollableContent>
          {this.renderSection('Active', active)}
          {this.renderSection('Idle', idle)}
          {this.renderSection('Offline', offline)}
        </ScrollableContent>
      </div>
    )
  }
}

class Channel extends React.Component {
  static propTypes = {
    channel: PropTypes.object.isRequired,
    onSendChatMessage: PropTypes.func,
    onRequestMoreHistory: PropTypes.func,
  }

  messageList = null
  _setMessageListRef = elem => {
    this.messageList = elem
  }
  state = {
    isScrolledUp: false,
  }

  componentWillUpdate(nextProps, nextState) {
    const insertingAtTop =
      nextProps.channel !== this.props.channel &&
      this.props.channel.messages.size > 0 &&
      nextProps.channel.messages.size > this.props.channel.messages.size &&
      nextProps.channel.messages.get(0) !== this.props.channel.messages.get(0)
    this.messageList.setInsertingAtTop(insertingAtTop)
  }

  render() {
    const { channel, onSendChatMessage } = this.props
    const messagesClass = this.state.isScrolledUp ? styles.messagesScrollBorder : styles.messages
    return (
      <div className={styles.container}>
        <div className={styles.messagesAndInput}>
          <div className={messagesClass}>
            <MessageList
              ref={this._setMessageListRef}
              loading={channel.loadingHistory}
              hasMoreHistory={channel.hasHistory}
              messages={channel.messages}
              onScrollUpdate={this.onScrollUpdate}
            />
          </div>
          <MessageInput className={styles.chatInput} onSend={onSendChatMessage} />
        </div>
        <UserList users={this.props.channel.users} />
      </div>
    )
  }

  onScrollUpdate = values => {
    const { scrollTop, scrollHeight, clientHeight } = values

    const isScrolledUp = scrollTop + clientHeight < scrollHeight
    if (isScrolledUp !== this.state.isScrolledUp) {
      this.setState({ isScrolledUp })
    }

    if (
      this.props.onRequestMoreHistory &&
      this.props.channel.hasHistory &&
      !this.props.channel.loadingHistory &&
      scrollTop < LOADING_AREA_BOTTOM
    ) {
      this.props.onRequestMoreHistory()
    }
  }
}

const mapStateToProps = state => {
  return {
    user: state.auth.user,
    chat: state.chat,
  }
}

function isLeavingChannel(oldProps, newProps) {
  return (
    oldProps.location === newProps.location &&
    oldProps.chat.byName.has(oldProps.match.params.channel.toLowerCase()) &&
    !newProps.chat.byName.has(oldProps.match.params.channel.toLowerCase())
  )
}

@connect(mapStateToProps)
export default class ChatChannelView extends React.Component {
  constructor(props) {
    super(props)
    this._handleSendChatMessage = ::this.onSendChatMessage
    this._handleRequestMoreHistory = ::this.onRequestMoreHistory
  }

  componentDidMount() {
    const routeChannel = this.props.match.params.channel
    if (this._isInChannel()) {
      this.props.dispatch(retrieveUserList(routeChannel))
      this.props.dispatch(retrieveInitialMessageHistory(routeChannel))
      this.props.dispatch(activateChannel(routeChannel))
    } else {
      this.props.dispatch(joinChannel(routeChannel))
    }
  }

  componentWillReceiveProps(nextProps) {
    if (isLeavingChannel(this.props, nextProps)) {
      this.props.dispatch(push('/'))
    }
  }

  componentDidUpdate(prevProps) {
    const prevChannel = prevProps.match.params.channel
    const routeChannel = this.props.match.params.channel
    if (this._isInChannel()) {
      this.props.dispatch(retrieveUserList(routeChannel))
      this.props.dispatch(retrieveInitialMessageHistory(routeChannel))
      this.props.dispatch(activateChannel(routeChannel))
    } else if (
      !prevProps.chat.byName.has(routeChannel) &&
      prevChannel.toLowerCase() !== routeChannel.toLowerCase()
    ) {
      if (MULTI_CHANNEL) {
        this.props.dispatch(joinChannel(routeChannel))
      } else {
        this.props.dispatch(push('/'))
      }
    }
    if (prevChannel && prevChannel.toLowerCase() !== routeChannel.toLowerCase()) {
      this.props.dispatch(deactivateChannel(prevChannel))
    }
  }

  componentWillUnmount() {
    this.props.dispatch(deactivateChannel(this.props.match.params.channel))
  }

  render() {
    const routeChannel = this.props.match.params.channel
    const channel = this.props.chat.byName.get(routeChannel.toLowerCase())

    if (!channel) {
      return (
        <div className={styles.loadingArea}>
          <LoadingIndicator />
        </div>
      )
    }

    return (
      <Channel
        channel={channel}
        onSendChatMessage={this._handleSendChatMessage}
        onRequestMoreHistory={this._handleRequestMoreHistory}
      />
    )
  }

  onSendChatMessage(msg) {
    this.props.dispatch(sendMessage(this.props.match.params.channel, msg))
  }

  onRequestMoreHistory() {
    this.props.dispatch(retrieveNextMessageHistory(this.props.match.params.channel))
  }

  _isInChannel() {
    const routeChannel = this.props.match.params.channel
    return this.props.chat.byName.has(routeChannel.toLowerCase())
  }
}
