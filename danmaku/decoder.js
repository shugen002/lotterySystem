var Consts = require('./consts.js')
var StringDecoder = require('string_decoder')

const textDecoder = new StringDecoder.StringDecoder('utf8')

function decodeBuffer(buff) {
  let data = {}
  data.packetLen = buff.readInt32BE(Consts.WS_PACKAGE_OFFSET)
  Consts.dataStruct.forEach((struct) => {
    if (struct.bytes === 4) {
      data[struct.key] = buff.readInt32BE(struct.offset)
    } else if (struct.bytes === 2) {
      data[struct.key] = buff.readInt16BE(struct.offset)
    }
  })
  if (data.op && data.op === Consts.WS_OP_MESSAGE) {
    data.body = []
    let packetLen = data.packetLen
    let headerLen = 0
    for (let offset = Consts.WS_PACKAGE_OFFSET; offset < buff.byteLength; offset += packetLen) {
      packetLen = buff.readInt32BE(offset)
      headerLen = buff.readInt16BE(offset + Consts.WS_HEADER_OFFSET)
      try {
        let body = JSON.parse(textDecoder.write(buff.slice(offset + headerLen, offset + packetLen)))
        data.body.push(body)
      } catch (e) {
        console.log('decode body error:', textDecoder.write(buff.slice(offset + headerLen, offset + packetLen)), data)
      }
    }
  } else if (data.op && data.op === Consts.WS_OP_HEARTBEAT_REPLY) {
    data.body = {
      number: buff.readInt32BE(Consts.WS_PACKAGE_HEADER_TOTAL_LENGTH)
    }
  }
  return data
}

function parseMessage(msg) {
  switch (msg.op) {
    case Consts.WS_OP_HEARTBEAT_REPLY:
      msg.body.type = 'online'
      msg.body.ts = new Date().getTime()
      return msg.body
    case Consts.WS_OP_MESSAGE:
      return msg.body.map((m) => {
        return transformMessage(m)
      })
    case Consts.WS_OP_CONNECT_SUCCESS:
      return {
        type: 'connected',
        ts: new Date().getTime()
      }
  }
}

function parsefansMedal(data) {
  if (data.length < 1) return false;
  return {
    level: data[0] || 0,
    label: data[1] || "--",
    anchorUsername: data[2] || "--",
    shortRoomID: data[3] || 0,
    unknown: data[4] || null,
    special: data[5] || ""
  }
}

function parsetitle(data) {
  if (data.length < 1) return void 0;
  return {
    name: data[0],
    source: data[1]
  }
}

function transformMessage(msg) {
  let message = {}
  switch (msg.cmd) {
    case 'DANMU_MSG':
      message.cmd = msg.cmd;
      message.content = msg.info[1] || "";
      message.userInfo = {
        uid: msg.info[2][0],
        username: msg.info[2][1],
        isAdmin: !!msg.info[2][2],
        isVIP: !!msg.info[2][3],
        isSVIP: !!msg.info[2][4],
        rank: msg.info[4][3],
        fansMedal: parsefansMedal(msg.info[3]),
        title: parsetitle(msg.info[5]),
        userLevel: msg.info[4][0] || 0,
        guardLevel: msg.info[7] || 0
      };
      message.rnd = ("number" == typeof msg.info[0][5] ? msg.info[0][5] : parseInt(msg.info[0][5])) || 0;
      message.activityInfo = {
        usernameColor: msg.info[2][7] || ""
      };
      message.raw = msg;
      break;
    default:
      message = msg
  }
  message.ts = new Date().getTime()
  return message
}

function decodeData(buff) {
  let messages = []
  try {
    let data = parseMessage(decodeBuffer(buff))
    if (data instanceof Array) {
      data.forEach((m) => {
        messages.push(m)
      })
    } else if (data instanceof Object) {
      messages.push(data)
    }
  } catch (e) {
    console.log('Socket message error', buff, e)
  }
  return messages
}

module.exports = {};
module.exports.decodeData = decodeData;