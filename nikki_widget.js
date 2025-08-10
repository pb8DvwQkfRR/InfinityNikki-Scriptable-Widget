/*!
 * 无限暖暖小组件
 * 
 * @name        InfinityNikki-Scriptable-Widget
 * @version     0.0.3
 * @date        2025-08-10
 * 
 * @license     AGPL-3.0
 */

// === 常量 ===
const MAX_ENERGY = 350;
const MINUTES_PER_ENERGY = 5;
const TEXT_FONT = Font.systemFont(12);
const TIME_FONT = Font.regularMonospacedSystemFont(10);
const REFRESH_INTERVAL_MINUTES = 30;
const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_MINUTES * 60 * 1000;

// === 通知常量 ===
const NOTIFICATION_THREAD_ID = "nikki5_notifications";
const NOTIFICATION_SOUND = "event";

// === 颜色常量 ===
const LABEL_COLOR = Color.white();
const VALUE_COLOR = Color.white();
const TIME_COLOR = new Color("#a0a0a0");
const COMPLETED_TEXT = "完成~撒花 🎉";
const COMPLETED_COLOR = new Color("#FF4500");
const DARK_BG = new Color("#1c1c1e");

// === Cookie 常量 ===
const KEY_MOMO_TOKEN = "momoToken";
const KEY_MOMO_NID = "momoNid";

// === NIKKI API URL ===
const NIKKI_API_URL = "https://myl-api.nuanpaper.com/v1/strategy/user/note/book/info";

// Snappy 解码 (credit to https://github.com/zhipeng-jia/snappyjs)
function unbase64(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const charMap = {};
  for (let i = 0; i < chars.length; i++) {
    charMap[chars[i]] = i;
  }
  
  base64 = base64.replace(/=/g, '');
  
  const binaryString = [];
  let buffer = 0;
  let bitsCollected = 0;
  
  for (let i = 0; i < base64.length; i++) {
    const char = base64[i];
    if (charMap.hasOwnProperty(char)) {
      buffer = (buffer << 6) | charMap[char];
      bitsCollected += 6;
      
      if (bitsCollected >= 8) {
        binaryString.push((buffer >>> (bitsCollected - 8)) & 0xFF);
        bitsCollected -= 8;
      }
    }
  }
  
  return new Uint8Array(binaryString);
}

var WORD_MASK = [0, 0xff, 0xffff, 0xffffff, 0xffffffff];

function copyBytes(fromArray, fromPos, toArray, toPos, length) {
  for (let i = 0; i < length; i++) {
    toArray[toPos + i] = fromArray[fromPos + i];
  }
}

function selfCopyBytes(array, pos, offset, length) {
  for (let i = 0; i < length; i++) {
    array[pos + i] = array[pos - offset + i];
  }
}

function readUncompressedLength(array) {
  let result = 0;
  let shift = 0;
  let pos = 0;
  let c, val;
  while (shift < 32 && pos < array.length) {
    c = array[pos];
    pos += 1;
    val = c & 0x7f;
    if (((val << shift) >>> shift) !== val) {
      return { length: -1, bytesRead: pos };
    }
    result |= val << shift;
    if (c < 128) {
      return { length: result, bytesRead: pos };
    }
    shift += 7;
  }
  return { length: -1, bytesRead: pos };
}

function snappyUncompress(compressed) {
  const lengthInfo = readUncompressedLength(compressed);
  const uncompressedLength = lengthInfo.length;
  if (uncompressedLength === -1) {
    throw new Error('Invalid Snappy bitstream: failed to read uncompressed length');
  }

  let pos = lengthInfo.bytesRead;
  const arrayLength = compressed.length;
  const outBuffer = new Uint8Array(uncompressedLength);
  let outPos = 0;
  let c, len, smallLen;
  let offset;

  while (pos < arrayLength) {
    c = compressed[pos];
    pos += 1;
    if ((c & 0x3) === 0) {
      len = (c >>> 2) + 1;
      if (len > 60) {
        if (pos + 3 >= arrayLength) {
          throw new Error('Invalid Snappy bitstream: insufficient data for long literal');
        }
        smallLen = len - 60;
        len = compressed[pos] + (compressed[pos + 1] << 8) + (compressed[pos + 2] << 16) + (compressed[pos + 3] << 24);
        len = (len & WORD_MASK[smallLen]) + 1;
        pos += smallLen;
      }
      if (pos + len > arrayLength) {
        throw new Error('Invalid Snappy bitstream: literal extends beyond input');
      }
      copyBytes(compressed, pos, outBuffer, outPos, len);
      pos += len;
      outPos += len;
    } else {
      switch (c & 0x3) {
        case 1:
          len = ((c >>> 2) & 0x7) + 4;
          offset = compressed[pos] + ((c >>> 5) << 8);
          pos += 1;
          break;
        case 2:
          if (pos + 1 >= arrayLength) {
            throw new Error('Invalid Snappy bitstream: insufficient data for 2-byte offset');
          }
          len = (c >>> 2) + 1;
          offset = compressed[pos] + (compressed[pos + 1] << 8);
          pos += 2;
          break;
        case 3:
          if (pos + 3 >= arrayLength) {
            throw new Error('Invalid Snappy bitstream: insufficient data for 4-byte offset');
          }
          len = (c >>> 2) + 1;
          offset = compressed[pos] + (compressed[pos + 1] << 8) + (compressed[pos + 2] << 16) + (compressed[pos + 3] << 24);
          pos += 4;
          break;
        default:
          throw new Error('Invalid Snappy bitstream: invalid tag');
      }
      if (offset === 0 || offset > outPos) {
        throw new Error(`Invalid Snappy bitstream: invalid offset (${offset}) or copy source beyond output (${outPos})`);
      }
      selfCopyBytes(outBuffer, outPos, offset, len);
      outPos += len;
    }
  }

  if (outPos !== uncompressedLength) {
      console.warn(`Warning: Decompressed ${outPos} bytes, expected ${uncompressedLength} bytes.`);
  }

  return outBuffer;
}

function decodeUTF8(bytes) {
  let str = '';
  let i = 0;
  
  while (i < bytes.length) {
    let byte1 = bytes[i++];
    
    if (byte1 < 0x80) {
      str += String.fromCharCode(byte1);
    } else if ((byte1 & 0xE0) === 0xC0) {
      if (i >= bytes.length) break;
      let byte2 = bytes[i++];
      str += String.fromCharCode(((byte1 & 0x1F) << 6) | (byte2 & 0x3F));
    } else if ((byte1 & 0xF0) === 0xE0) {
      if (i + 1 >= bytes.length) break;
      let byte2 = bytes[i++];
      let byte3 = bytes[i++];
      str += String.fromCharCode(((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F));
    } else if ((byte1 & 0xF8) === 0xF0) {
      if (i + 2 >= bytes.length) break;
      let byte2 = bytes[i++];
      let byte3 = bytes[i++];
      let byte4 = bytes[i++];
      let codePoint = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
      
      codePoint -= 0x10000;
      str += String.fromCharCode(0xD800 + (codePoint >>> 10));
      str += String.fromCharCode(0xDC00 + (codePoint & 0x3FF));
    } else {
      continue;
    }
  }
  
  return str;
}

function decodeSnappyBase64ToJson(base64Data) {
  try {
    const compressedBytes = unbase64(base64Data);
    const uncompressedBytes = snappyUncompress(compressedBytes);
    const jsonString = decodeUTF8(uncompressedBytes);
    return JSON.parse(jsonString);
  } catch (error) {
    console.log("Snappy 解码错误: " + error.message);
    return null;
  }
}

/**
 * 引导用户登录并获取认证 Cookie
 * @returns {Promise<boolean>} 登录成功返回 true，失败或取消则抛出错误
 */
async function promptLogin() {
  const loginURL = "https://myl.nuanpaper.com/tools/journal";
  const guideAlert = new Alert();
  guideAlert.title = "登录指引";
  guideAlert.message = "即将打开登录页面\n请在新窗口中完成登录\n登录完成后，请务必点击屏幕左上角的'完成'按钮关闭登录窗口";
  guideAlert.addAction("知道了，去登录");
  guideAlert.addCancelAction("取消");
  const guideResponse = await guideAlert.present();
  if (guideResponse === -1) {
    throw new Error("用户取消登录");
  }

  const webView = new WebView();
  await webView.loadURL(loginURL);
  await webView.present(true);

  const confirmAlert = new Alert();
  confirmAlert.title = "确认登录";
  confirmAlert.message = "您已关闭登录窗口。请确认登录是否已完成？";
  confirmAlert.addAction("已完成登录");
  confirmAlert.addCancelAction("未完成，重新登录");
  const confirmResponse = await confirmAlert.present();
  if (confirmResponse === -1) {
    throw new Error("用户确认登录未完成");
  }

  const cookieScript = `
    (function() {
      var cookies = document.cookie.split("; ");
      var result = {};
      for (var i = 0; i < cookies.length; i++) {
        var parts = cookies[i].split("=");
        result[parts[0]] = parts[1];
      }
      return JSON.stringify(result);
    })();
  `;
  let cookies = {};
  try {
    const cookieJSON = await webView.evaluateJavaScript(cookieScript);
    cookies = JSON.parse(cookieJSON);
  } catch (e) {
  }

  const momoToken = cookies[KEY_MOMO_TOKEN];
  const momoNid = cookies[KEY_MOMO_NID];

  if (momoToken && momoNid) {
    Keychain.set(KEY_MOMO_TOKEN, momoToken);
    Keychain.set(KEY_MOMO_NID, momoNid);
    return true;
  } else {
    throw new Error("未能获取登录状态，请确认已正确登录并关闭了登录窗口");
  }
}

/**
 * 处理 Snappy 压缩数据
 * @param {Object} requestData 包含 token 和 openid 的对象
 * @returns {Promise<Object>} 解码后的游戏数据
 */
async function fetchNikkiData(requestData) {
  try {
    //uncomment this while debugging
    //console.log("NIKKI_API_URL: " + NIKKI_API_URL);
    
    const req = new Request(NIKKI_API_URL);
    req.method = "POST";
    req.headers = {
      "Cookie": `momoToken=${requestData.token}; momoNid=${requestData.openid}`,
      "Content-Type": "application/json"
    };
    
    const bodyData = {
      client_id: 1106,
      token: requestData.token,
      openid: requestData.openid
    };
    req.body = JSON.stringify(bodyData);
    
    const rawData = await req.load();
    //uncomment this while debugging
    //console.log("statusCode: " + req.response?.statusCode);
    
    const base64Data = rawData.toBase64String();
    //uncomment this while debugging
    //console.log("base64Data: " + base64Data);
    
    if (base64Data.length === 0) {
      throw new Error("API 返回空响应");
    }
    
    try {
      const directData = Data.fromBase64String(base64Data);
      const rawString = directData.toRawString();
      const directJson = JSON.parse(rawString);
      
      if (directJson.code && directJson.code !== 0) {
        if (directJson.code === 1801 && directJson.info === "need login.") {
          throw new Error("需要重新登录");
        }
        throw new Error(`API 错误: [${directJson.code}] ${directJson.info}`);
      }
    } catch (jsonError) {
      if (jsonError.message === "需要重新登录") {
        throw jsonError;
      }
    }
    
    // Snappy 解码
    const result = decodeSnappyBase64ToJson(base64Data);
    
    if (!result) {
      throw new Error("Snappy 解码失败");
    }
    
    if (result.flag && result.flag !== 0) {
      throw new Error(`API 返回错误, Flag: ${result.flag}`);
    }
    
    if (!result.info_from_gm) {
      throw new Error("API 响应缺少数据");
    }
    
    return result.info_from_gm;
    
  } catch (error) {
    console.error("❌ 获取游戏数据失败:", error.message);
    throw error;
  }
}

/**
 * 获取用户信息（昵称、头像、等级）
 * @param {Object} requestData 包含 token 和 openid 的对象
 * @returns {Promise<Object>} 包含 nickname, avatar, level 的对象
 */
async function getUserInfo(requestData) {
  const userInfoURL = "https://myl-api.nuanpaper.com/v1/strategy/user/info/get";
  try {
    const req = new Request(userInfoURL);
    req.method = 'POST';
    req.headers = {
      'Content-Type': 'application/json'
    };
    const bodyData = {
      client_id: 1106,
      openid: requestData.openid,
      token: requestData.token
    };
    req.body = JSON.stringify(bodyData);
    const response = await req.loadJSON();

    if (response.code === 0 && response.data && response.data.role) {
      return {
        nickname: response.data.role.nickname || null,
        avatar: response.data.role.avatar || null,
        level: response.data.role.level || null
      };
    }
  } catch (e) {
    console.error("获取用户信息失败:", e);
  }
  return { nickname: null, avatar: null, level: null };
}

/**
 * 计算当前体力值
 * @param {number} serverTimestampMs 服务器时间戳 (毫秒)
 * @param {number} userTimestampSec 用户记录时间戳 (秒)
 * @param {number} userEnergy 用户记录体力值
 * @returns {number} 当前计算出的体力值
 */
function calculateActiveEnergy(serverTimestampMs, userTimestampSec, userEnergy) {
  if (userTimestampSec <= 0) return userEnergy;

  const serverTime = new Date(serverTimestampMs);
  const userRecordTime = new Date(userTimestampSec * 1000);

  if (userRecordTime > serverTime) return MAX_ENERGY;

  const elapsedMinutes = Math.floor((serverTime - userRecordTime) / (1000 * 60));
  const restoredEnergy = Math.floor(elapsedMinutes / MINUTES_PER_ENERGY);
  let currentEnergy = userEnergy + restoredEnergy;
  return Math.min(currentEnergy, MAX_ENERGY);
}

/**
 * 计算体力恢复满格时间
 * @param {number} currentEnergy 当前体力值
 * @returns {string} 格式化的恢复满格时间字符串
 */
function calculateFullEnergyTime(currentEnergy) {
  const needEnergy = MAX_ENERGY - currentEnergy;
  if (needEnergy <= 0) {
    return new Date().toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(/\//g, '/');
  }
  const fullMinutes = needEnergy * MINUTES_PER_ENERGY;
  const fullTime = new Date(Date.now() + fullMinutes * 60000);
  return fullTime.toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).replace(/\//g, '/');
}

/**
 * 检查并发送通知
 * @param {string} nickname 用户昵称
 * @param {number} currentEnergy 当前体力值
 * @param {Array} dispatchTasks 挖掘任务数组
 */
async function checkAndSendNotifications(nickname, currentEnergy, dispatchTasks) {
  try {
    await clearExistingNotifications();
    
    const notificationsToSend = [];
    const now = new Date();

    // 检查体力
    const needEnergy = MAX_ENERGY - currentEnergy;
    if (needEnergy > 0) {
      const fullMinutes = needEnergy * MINUTES_PER_ENERGY;
      const fullTime = new Date(now.getTime() + fullMinutes * 60 * 1000);
      
      if (fullMinutes > 60) {
        const triggerTime = new Date(fullTime.getTime() - 60 * 60 * 1000);
        if (triggerTime > now) {
          notificationsToSend.push({
            id: "energy_1h",
            title: `亲爱的搭配师 ${nickname}`,
            body: "体力将在1小时内回满，请及时清理～",
            triggerTime: triggerTime
          });
        }
      }
      
      if (fullMinutes > 30) {
        const triggerTime = new Date(fullTime.getTime() - 30 * 60 * 1000);
        if (triggerTime > now) {
          notificationsToSend.push({
            id: "energy_30m",
            title: `亲爱的搭配师 ${nickname}`,
            body: "体力将在30分钟内回满，请及时清理～",
            triggerTime: triggerTime
          });
        }
      }
    }

    // 检查挖掘
    if (dispatchTasks && Array.isArray(dispatchTasks) && dispatchTasks.length > 0) {
      const task = dispatchTasks[0];
      const hoursMap = { 1: 4, 2: 8, 3: 12, 4: 20 };
      const hours = hoursMap.hasOwnProperty(task.spend_time) ? hoursMap[task.spend_time] : task.spend_time;
      const endTime = new Date(task.start_time * 1000 + hours * 3600000);
      const remainingMs = endTime.getTime() - now.getTime();

      if (remainingMs > 0) {
        if (remainingMs > 60 * 60 * 1000) {
          const triggerTime = new Date(endTime.getTime() - 60 * 60 * 1000);
          if (triggerTime > now) {
            notificationsToSend.push({
              id: "dig_1h",
              title: `亲爱的搭配师 ${nickname}`,
              body: "挖掘将在1小时内完成，请及时收获～",
              triggerTime: triggerTime
            });
          }
        }
        
        if (remainingMs > 30 * 60 * 1000) {
          const triggerTime = new Date(endTime.getTime() - 30 * 60 * 1000);
          if (triggerTime > now) {
            notificationsToSend.push({
              id: "dig_30m",
              title: `亲爱的搭配师 ${nickname}`,
              body: "挖掘将在30分钟内完成，请及时收获～",
              triggerTime: triggerTime
            });
          }
        }
      }
    }

    // 预约通知
    for (const notificationData of notificationsToSend) {
      await scheduleNotification(notificationData);
    }
  } catch (error) {
    console.error("❌ 检查或发送通知时出错:", error);
  }
}

// 清理所有现有的通知
async function clearExistingNotifications() {
  try {
    const pendingNotifications = await Notification.allPending();
    const toRemove = [];
    
    for (const notification of pendingNotifications) {
      if (notification.threadIdentifier === NOTIFICATION_THREAD_ID) {
        toRemove.push(notification.identifier);
      }
    }
    
    // 移除预约
    if (toRemove.length > 0) {
      await Notification.removePending(toRemove);
    }
  } catch (error) {
    console.error("❌ 清理通知时出错:", error);
  }
}

/**
 * 预约通知
 * @param {Object} notificationData 通知数据
 */
async function scheduleNotification(notificationData) {
  try {
    const notification = new Notification();
    notification.identifier = notificationData.id;
    notification.title = notificationData.title;
    notification.body = notificationData.body;
    notification.threadIdentifier = NOTIFICATION_THREAD_ID;
    notification.sound = NOTIFICATION_SOUND;
    
    notification.setTriggerDate(notificationData.triggerTime);
    
    await notification.schedule();
  } catch (error) {
    console.error(`❌ 安排通知 ${notificationData.id} 失败:`, error);
  }
}

function addStatusRow(widget, label, currentValue, maxValue, completedText = COMPLETED_TEXT, isBooleanStatus = false, isChallengeStatus = false) {
  const row = widget.addStack();
  row.layoutHorizontally();

  const labelElement = row.addText(label);
  labelElement.font = TEXT_FONT;
  labelElement.textColor = LABEL_COLOR;
  row.addSpacer(4);

  let displayText, textColor;

  if (isBooleanStatus || isChallengeStatus) {
     const isComplete = currentValue === 1 || currentValue === true;
     if (isComplete) {
       displayText = completedText;
       textColor = COMPLETED_COLOR;
     } else {
       displayText = isChallengeStatus ? '未挑战' : '未完成';
       textColor = VALUE_COLOR;
     }
  } else {
    const isComplete = currentValue === maxValue;
    if (isComplete) {
      displayText = completedText;
      textColor = COMPLETED_COLOR;
    } else {
      displayText = `${currentValue}/${maxValue}`;
      textColor = VALUE_COLOR;
    }
  }

  const valueElement = row.addText(displayText);
  valueElement.font = TEXT_FONT;
  valueElement.textColor = textColor;
  row.addSpacer();
  widget.addSpacer(3);
}

/**
 * 创建并返回小组件
 * @returns {Promise<ListWidget>} Widget 实例
 */
async function createWidget() {
  try {
    let requestData;
    let storedToken = null;
    let storedOpenid = null;

    // 从 Keychain 获取存储的凭据
    try {
      if (Keychain.contains(KEY_MOMO_TOKEN)) {
        storedToken = Keychain.get(KEY_MOMO_TOKEN);
      }
      if (Keychain.contains(KEY_MOMO_NID)) {
        storedOpenid = Keychain.get(KEY_MOMO_NID);
      }
    } catch (e) {
      console.warn("读取 Keychain 时发生错误:", e);
    }

    // 如果没有凭据，引导用户登录
    if (!storedToken || !storedOpenid) {
       try {
         await promptLogin();
         storedToken = Keychain.get(KEY_MOMO_TOKEN);
         storedOpenid = Keychain.get(KEY_MOMO_NID);
       } catch (loginError) {
         throw loginError;
       }
    }

    // 检查凭据有效性
    if (storedToken && storedOpenid) {
      requestData = {
        token: storedToken,
        openid: storedOpenid
      };
    } else {
      throw new Error("无法获取有效的认证凭据");
    }

    const data = await fetchNikkiData(requestData);

    // 获取服务器时间（用于体力计算）
    let serverTimeMs;
    try {
       const timeReq = new Request('https://chaos.papegames.com/system/time');
       const timeRes = await timeReq.loadJSON();
       serverTimeMs = timeRes.timestamp;
    } catch (timeErr) {
       console.warn("获取服务器时间失败，使用本地时间:", timeErr);
       serverTimeMs = Date.now();
    }

    // 获取用户信息
    const userInfo = await getUserInfo(requestData);
    const nickname = userInfo.nickname;
    const avatarUrl = userInfo.avatar;
    const level = userInfo.level;

    // 计算体力相关数据
    const currentEnergy = calculateActiveEnergy(serverTimeMs, data.timestamp, data.energy);
    const fullEnergyTimeStr = calculateFullEnergyTime(currentEnergy);

    // 检查并发送通知
    await checkAndSendNotifications(nickname, currentEnergy, data.dispatch);

    // 创建并配置小组件
    const widget = new ListWidget();
    widget.refreshAfterDate = new Date(Date.now() + REFRESH_INTERVAL_MS);
    widget.backgroundColor = DARK_BG;

    // 设置背景图片
    if (avatarUrl) {
      try {
        const avatarReq = new Request(avatarUrl);
        const avatarImage = await avatarReq.loadImage();
        const scrim = new DrawContext();
        scrim.size = avatarImage.size;
        scrim.drawImageInRect(avatarImage, new Rect(0, 0, avatarImage.size.width, avatarImage.size.height));

        const overlayColor = new Color("#000000", 0.7);
        scrim.setFillColor(overlayColor);
        scrim.fillRect(new Rect(0, 0, avatarImage.size.width, avatarImage.size.height));
        const backgroundImage = scrim.getImage();
        widget.backgroundImage = backgroundImage;
      } catch (e) {
        console.error("加载或处理头像失败:", e);
      }
    }
    widget.setPadding(10, 10, 10, 10);

    // 标题
    const titleText = "无限暖暖";
    const title = widget.addText(titleText);
    title.textColor = LABEL_COLOR;
    title.font = Font.systemFont(14);
    title.centerAlignText();
    widget.addSpacer(6);

    // 昵称、等级
    if (nickname) {
      const nicknameAndLevelRow = widget.addStack();
      nicknameAndLevelRow.layoutHorizontally();
      nicknameAndLevelRow.centerAlignContent();
      const nicknameText = nicknameAndLevelRow.addText(`${nickname}  Lv. ${level}`);
      nicknameText.textColor = VALUE_COLOR;
      nicknameText.font = TEXT_FONT;
      widget.addSpacer(3);
    }

    // 日常
    addStatusRow(widget, "日常:", data.daily_task, 500);

    // 星海
    addStatusRow(widget, "星海:", data.star_sea, 500);

    // 周本
    addStatusRow(widget, "周本:", data.weekly_reward_status, null, '已挑战', true, true);

    // 体力
    const energyRow = widget.addStack();
    energyRow.layoutHorizontally();
    const energyLabel = energyRow.addText("体力:");
    energyLabel.font = TEXT_FONT;
    energyLabel.textColor = LABEL_COLOR;
    energyRow.addSpacer(4);

    const isEnergyFull = currentEnergy >= MAX_ENERGY;
    const energyValueText = isEnergyFull ? "已恢复满格!" : `${currentEnergy}`;
    const energyValue = energyRow.addText(energyValueText);
    energyValue.font = Font.regularMonospacedSystemFont(12);
    energyValue.textColor = isEnergyFull ? COMPLETED_COLOR : VALUE_COLOR;
    energyRow.addSpacer();

    if (!isEnergyFull) {
      const energyFullTime = energyRow.addText(fullEnergyTimeStr);
      energyFullTime.font = TIME_FONT;
      energyFullTime.textColor = TIME_COLOR;
    }
    widget.addSpacer(3);

    // 挖掘
    const digRow = widget.addStack();
    digRow.layoutHorizontally();

    const currentTaskCount = (data.dispatch && Array.isArray(data.dispatch)) ? data.dispatch.length : 0;
    if (currentTaskCount > 0) {
      const task = data.dispatch[0];
      const hoursMap = { 1: 4, 2: 8, 3: 12, 4: 20 };
      const hours = hoursMap.hasOwnProperty(task.spend_time) ? hoursMap[task.spend_time] : task.spend_time;
      const endTime = new Date(task.start_time * 1000 + hours * 3600000);
      const now = new Date();

      if (now >= endTime) {
        const waitingText = digRow.addText("等待收获~");
        waitingText.font = TEXT_FONT;
        waitingText.textColor = COMPLETED_COLOR;
        digRow.addSpacer();
      } else {
        const taskNameAndCount = digRow.addText("正在挖掘~");
        taskNameAndCount.font = TEXT_FONT;
        taskNameAndCount.textColor = VALUE_COLOR;
        digRow.addSpacer();
        const timeStr = endTime.toLocaleString('zh-CN', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(/\//g, '/');
        const taskEndTime = digRow.addText(timeStr);
        taskEndTime.font = TIME_FONT;
        taskEndTime.textColor = TIME_COLOR;
      }
    } else {
      const noTaskText = digRow.addText("暂无挖掘~");
      noTaskText.font = TEXT_FONT;
      noTaskText.textColor = LABEL_COLOR;
      digRow.addSpacer();
    }

    // 刷新时间
    widget.addSpacer(6);
    const refreshInfoRow = widget.addStack();
    refreshInfoRow.layoutHorizontally();
    refreshInfoRow.centerAlignContent();
    const lastRefreshDate = new Date();
    const lastRefreshTimeStr = lastRefreshDate.toLocaleString('zh-CN', {
       month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
     }).replace(/\//g, '/');
    const refreshInfoText = refreshInfoRow.addText(`上次刷新: ${lastRefreshTimeStr}`);
    refreshInfoText.font = TIME_FONT;
    refreshInfoText.textColor = TIME_COLOR;

    return widget;
  } catch (err) {
    // 错误处理 - 返回错误提示小组件
    console.error("创建小组件时发生错误:", err);
    const widget = new ListWidget();
    widget.backgroundColor = DARK_BG;
    widget.setPadding(12, 12, 12, 12);
    widget.refreshAfterDate = new Date(Date.now() + REFRESH_INTERVAL_MS);

    const titleText = "无限暖暖";
    const title = widget.addText(titleText);
    title.textColor = LABEL_COLOR;
    title.font = Font.systemFont(14);
    title.centerAlignText();
    widget.addSpacer(12);

    const errorTitle = widget.addText("加载失败");
    errorTitle.font = TEXT_FONT;
    errorTitle.textColor = LABEL_COLOR;

    const errorMsg = widget.addText("错误: " + err.message);
    errorMsg.font = TEXT_FONT;
    errorMsg.textColor = VALUE_COLOR;
    widget.addSpacer(12);

    // 根据错误类型提供更具体的提示
    if (err.message === "用户取消登录" || err.message.includes("未能获取 momoToken")) {
        const hint = widget.addText("请稍后重试或检查网络连接");
        hint.font = Font.systemFont(12);
        hint.textColor = TIME_COLOR;
    } else if (err.message.includes("需要重新登录")) {
        const hint1 = widget.addText("登录状态已过期");
        const hint2 = widget.addText("请重新运行脚本登录");
        hint1.font = Font.systemFont(12);
        hint1.textColor = TIME_COLOR;
        hint2.font = Font.systemFont(11);
        hint2.textColor = TIME_COLOR;
        Keychain.remove(KEY_MOMO_NID);
        Keychain.remove(KEY_MOMO_TOKEN);
    } else if (err.message.includes("Snappy")) {
        const hint1 = widget.addText("数据解析失败");
        const hint2 = widget.addText("请检查网络连接");
        hint1.font = Font.systemFont(12);
        hint1.textColor = TIME_COLOR;
        hint2.font = Font.systemFont(11);
        hint2.textColor = TIME_COLOR;
    }
    widget.addSpacer();
    return widget;
  }
}

// ===============================================================

if (config.runsInWidget) {
  try {
    Script.setWidget(await createWidget());
  } catch (e) {
    console.error("设置小组件时发生未捕获的错误:", e);
  }
} else {
  // 在主应用环境中运行（用于预览或管理）
  const mainAlert = new Alert();
  mainAlert.title = "无限暖暖小组件";
  mainAlert.message = "请选择操作：";
  mainAlert.addAction("🔍 预览小组件/重新登录");
  mainAlert.addAction("🗑️ 清除登录信息");
  mainAlert.addCancelAction("❌ 取消");
  const mainResponse = await mainAlert.present();

  if (mainResponse === 0) {
    // 预览
    try {
      const widget = await createWidget();
      await widget.presentSmall();
    } catch (e) {
      const errorAlert = new Alert();
      errorAlert.title = "预览失败";
      errorAlert.message = `无法生成小组件: ${e.message}`;
      errorAlert.addAction("确定");
      await errorAlert.present();
    }
  } else if (mainResponse === 1) {
    // 清除登录信息
    try {
      let removedKeys = [];
      if (Keychain.contains(KEY_MOMO_TOKEN)) {
        Keychain.remove(KEY_MOMO_TOKEN);
        removedKeys.push(KEY_MOMO_TOKEN);
      }
      if (Keychain.contains(KEY_MOMO_NID)) {
        Keychain.remove(KEY_MOMO_NID);
        removedKeys.push(KEY_MOMO_NID);
      }
      const successAlert = new Alert();
      if (removedKeys.length > 0) {
        successAlert.title = "成功";
        successAlert.message = `已清除登录信息\n您可以重新运行脚本以登录。`;
      } else {
        successAlert.title = "信息";
        successAlert.message = "未找到存储的登录信息。";
      }
      successAlert.addAction("确定");
      await successAlert.present();
    } catch (e) {
      const errorAlert = new Alert();
      errorAlert.title = "错误";
      errorAlert.message = `清除登录信息失败: ${e.message}`;
      errorAlert.addAction("确定");
      await errorAlert.present();
    }
  }
}
Script.complete();
