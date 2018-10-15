var WebSocket = require('ws')
var EventEmitter = require('events')
var _ = require('lodash')

var DMDecoder = require('./decoder')
var DMEncoder = require('./encoder')

const WSDMPROTOCOL = 'ws'
const WSSDMPROTOCOL = 'wss'
const WSDMSERVER = 'broadcastlv.chat.bilibili.com'
const WSDMPORT = 2244
const WSSDMPORT = 2245
const WSDMPATH = 'sub'

const HEARTBEAT_DELAY = 1e4
const CHECK_ERROR_DELAY = 3e4
const RECONNECT_DELAY = 3e3

module.exports = class DanmakuService extends EventEmitter {
  constructor(config = {}) {
    super()

    this.roomId = config.roomId || '23058' // 此处需要使用原始房间号
    this.userId = config.userId || this.randUid()
    this.useWebsocket = true
    this.useWSS = true

    this._socket = null
    this._websocketEvents = {
      connect: 'open',
      data: 'message',
      close: 'close',
      error: 'error'
    }
    this._heartbeatService = null
    this._reconnectService = null
    this._checkErrorService = _.debounce(() => {
      this.emit('error', 'check failed')
      this.reconnectByError()
    }, CHECK_ERROR_DELAY)
  }

  randUid() {
    return 1E15 + Math.floor(2E15 * Math.random())
  }

  connect() {
    if (this.useWSS) {
      this._socket = new WebSocket(`${WSSDMPROTOCOL}://${WSDMSERVER}:${WSSDMPORT}/${WSDMPATH}`)
    } else {
      this._socket = new WebSocket(`${WSDMPROTOCOL}://${WSDMSERVER}:${WSDMPORT}/${WSDMPATH}`)
    }
    this.handleEvents()
  }

  disconnect() {
    clearTimeout(this._heartbeatService)
    clearTimeout(this._reconnectService)
    this._checkErrorService.cancel()

    if (this.useWebsocket) {
      this._socket.close()
    } else {
      this._socket.end()
    }
    this._socket = null
  }

  reconnect() {
    this.disconnect()
    this.connect()
  }

  reconnectByError() {
    if (this._reconnectService) {
      clearTimeout(this._reconnectService)
    }
    this._reconnectService = setTimeout(() => {
      this.reconnect()
    }, RECONNECT_DELAY)
  }

  handleEvents() {
    let socket = this._socket
    let events = this._websocketEvents

    socket.on(events.connect, () => {
      if (socket !== this._socket) return
      this.sendJoinRoom()
      this.emit('connect')
    })

    socket.on(events.data, (msg) => {
      if (socket !== this._socket) return
      this._checkErrorService()
      DMDecoder.decodeData(msg).map(m => {
        if (m.type === 'connected') {
          this.sendHeartbeat()
          this.emit(m.type, m)
        } else {
          this.emit('data', m)
          this.emit(m.type, m)
        }
      })
    })

    socket.on(events.close, () => {
      if (socket !== this._socket) return
      this.emit('close')
    })

    socket.on(events.error, (err) => {
      if (socket !== this._socket) return
      this.emit('error', err)
      this.reconnectByError()
    })
  }

  sendJoinRoom() {
    this._socket.send(DMEncoder.encodeJoinRoom(this.roomId, this.userId), err => {
      if (err) {
        console.log('[Danmaku Service Error]:', err)
      }
    })
  }

  sendHeartbeat() {
    this._socket.send(DMEncoder.encodeHeartbeat(), err => {
      if (err) {
        console.log('[Danmaku Service Error]:', err)
      }
    })
    this._heartbeatService = setTimeout(() => {
      this.sendHeartbeat()
    }, HEARTBEAT_DELAY)
  }
}