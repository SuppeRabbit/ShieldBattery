import koaPino from 'koa-pino-logger'
import { getLoggerOptions } from './logger'

export default function logMiddleware() {
  return koaPino(getLoggerOptions())
}
