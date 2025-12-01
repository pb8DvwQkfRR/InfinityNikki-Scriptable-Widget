/*!
 * 无限暖暖小组件
 * 
 * @name        InfinityNikki-Scriptable-Widget
 * @version     0.1.1
 * @date        2025-12-01
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
const KEY_MOMO_REFRESH_TOKEN = "momoRefreshToken";
// === NIKKI API URL ===
const NIKKI_API_URL = "https://myl-api.nuanpaper.com/v1/strategy/user/note/book/info";

// === 登录配置 ===
const LOGIN_CONFIG = {
    appId: "1010013",
    appKey: "NsalbZh76U8VGJp1",
    aesKey: "ZTM7fu0xYnzkE5Km"
};

/**
 * 下载并加载 CryptoJS
 * @returns {Object} CryptoJS 模块对象
 */
async function loadCryptoLibrary() {
    const fm = FileManager.local();
    const libPath = fm.joinPath(fm.documentsDirectory(), "crypto-js.min.js");

    if (!fm.fileExists(libPath)) {
        const req = new Request("https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js");
        try {
            const jsContent = await req.load();
            fm.write(libPath, jsContent);
        } catch (e) {
            throw new Error("下载依赖库失败，请检查网络: " + e.message);
        }
    }

    try {
        const module = importModule(libPath);
        return module;
    } catch (e) {
        if (fm.fileExists(libPath)) {
            fm.remove(libPath);
        }
        throw new Error("加载库失败，请重新运行脚本: " + e.message);
    }
}

class PaperGamesClient {
    /**
     * @param {Object} cryptoInstance - 传入加载好的 CryptoJS 对象
     */
    constructor(cryptoInstance) {
        if (!cryptoInstance) {
            throw new Error("CryptoJS 未注入");
        }
        this.C = cryptoInstance;
        
        this.aesKey = this.C.enc.Utf8.parse(LOGIN_CONFIG.aesKey);
        this.aesIv = this.aesKey; 
        this.appKey = LOGIN_CONFIG.appKey;
        this.baseUrl = "https://passport.papegames.com";
    }

    _aesEncrypt(text) {
        const encrypted = this.C.AES.encrypt(text, this.aesKey, {
            iv: this.aesIv,
            mode: this.C.mode.CBC,
            padding: this.C.pad.Pkcs7
        });
        return encrypted.toString();
    }

    _aesDecrypt(encryptedBase64) {
        try {
            const decrypted = this.C.AES.decrypt(encryptedBase64, this.aesKey, {
                iv: this.aesIv,
                mode: this.C.mode.CBC,
                padding: this.C.pad.Pkcs7
            });
            return decrypted.toString(this.C.enc.Utf8);
        } catch (e) {
            console.error("解密失败: " + e);
            return null;
        }
    }

    _generateSign(params) {
        const keys = Object.keys(params).filter(k => k !== 'data' && k !== 'sign' && params[k] !== null);
        keys.sort();

        const queryList = [];
        for (const key of keys) {
            let val = String(params[key]);
            // JS 的 encodeURIComponent 类似于 Python 的 quote，但需要处理 * 号
            let encodedVal = encodeURIComponent(val).replace(/\*/g, '%2A');
            queryList.push(`${key}=${encodedVal}`);
        }
        
        const signStr = queryList.join("&");
        return this.C.HmacMD5(signStr, this.appKey).toString();
    }

    async login(account, password) {
        const apiPath = "/v1/user/login";

        const payload = {
            account: account,
            password: password
        };

        const jsonStr = JSON.stringify(payload); 
        const encryptedData = this._aesEncrypt(jsonStr);

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const params = {
            app_id: LOGIN_CONFIG.appId,
            timestamp: timestamp,
            sign_type: "hmac",
            clientid: "1106",
            lang: "zh-cn",
            data: encryptedData
        };

        params.sign = this._generateSign(params);

        return await this._postRequest(apiPath, params);
    }

    /**
     * 刷新 Token 接口
     * @param {string} accessToken 旧的 Access Token
     * @param {string} refreshToken 旧的 Refresh Token
     */
    async refreshToken(accessToken, refreshToken) {
        const apiPath = "/v1/user/login/token/refresh";

        // 构造 Payload，结构参考 Python 脚本
        const payload = {
            token: accessToken,
            refresh_token: refreshToken
        };

        const jsonStr = JSON.stringify(payload);
        const encryptedData = this._aesEncrypt(jsonStr);

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const params = {
            app_id: LOGIN_CONFIG.appId,
            clientid: "1106",
            client_id: "1106",
            data: encryptedData,
            lang: "zh-cn",
            sign_type: "hmac",
            timestamp: timestamp
        };

        params.sign = this._generateSign(params);

        return await this._postRequest(apiPath, params);
    }

    async _postRequest(apiPath, params) {
        const formBody = [];
        for (const property in params) {
            const encodedKey = encodeURIComponent(property);
            const encodedValue = encodeURIComponent(params[property]);
            formBody.push(encodedKey + "=" + encodedValue);
        }
        const bodyStr = formBody.join("&");

        const req = new Request(this.baseUrl + apiPath);
        req.method = "POST";
        req.headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        };
        req.body = bodyStr;

        try {
            const respJson = await req.loadJSON();
            if (respJson.data) {
                const decryptedStr = this._aesDecrypt(respJson.data);
                if (decryptedStr) {
                    return JSON.parse(decryptedStr);
                }
            }
            return respJson;
        } catch (e) {
            console.error(`请求错误 [${apiPath}]: ` + e);
            throw e;
        }
    }
}

// Snappy 解码 (Credit: https://github.com/zhipeng-jia/snappyjs)

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
    let c,
    val;
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
    return {
        length: -1,
        bytesRead: pos
    };
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
    let c,
    len,
    smallLen;
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
                throw new Error(`Invalid Snappy bitstream: invalid offset(${offset}) or copy source beyond output(${outPos})`);
            }
            selfCopyBytes(outBuffer, outPos, offset, len);
            outPos += len;
        }
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
    } catch(error) {
        console.log("Snappy 解码错误: " + error.message);
        return null;
    }
}

/**
 * 计算重置时间点
 * @param {Object} userData 用户数据
 * @param {number} serverTimeMs 服务器时间戳(毫秒)
 * @returns {number} 重置时间点的时间戳(毫秒)
 */
function getResetTimeStamp(userData, serverTimeMs) {
    const now = new Date(serverTimeMs);
    const localHour = parseInt(now.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        hour12: false
    }));

    const resetHour = 4;
    const localNow = new Date(now.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai"
    }));
    const resetToday = new Date(localNow);
    resetToday.setHours(resetHour, 0, 0, 0);

    const lastReset = localHour >= resetHour ? resetToday: new Date(resetToday.getTime() - 24 * 3600 * 1000);
    return lastReset.getTime();
}

/**
 * 计算实际日常进度
* @param {Object} userData 用户数据
 * @param {number} serverTimeMs 服务器时间戳(毫秒)
 * @returns {number} 实际日常进度
 */
function calculateDailyTask(userData, serverTimeMs) {
    if (!userData) return 0;
    const userTimestamp = userData.timestamp * 1000;
    const resetTime = getResetTimeStamp(userData, serverTimeMs);
    return userTimestamp < resetTime ? 0 : userData.daily_task;
}

/**
 * 计算实际星海进度
 * @param {Object} userData 用户数据
 * @param {number} serverTimeMs 服务器时间戳(毫秒)
 * @returns {number} 实际星海进度
 */
function calculateStarSea(userData, serverTimeMs) {
    if (!userData) return 0;
    const userTimestamp = userData.timestamp * 1000;
    const resetTime = getResetTimeStamp(userData, serverTimeMs);
    return userTimestamp < resetTime ? 0 : userData.star_sea;
}

/**
 * API 登录
 */
async function promptLogin() {
    const cryptoLib = await loadCryptoLibrary();
    const alert = new Alert();
    alert.title = "无限暖暖小组件登录";
    alert.message = "请输入叠纸账号和密码";
    alert.addTextField("邮箱/手机号", "");
    alert.addSecureTextField("密码", "");
    alert.addAction("登录");
    alert.addCancelAction("取消");

    const response = await alert.present();
    if (response === -1) {
        throw new Error("用户取消登录");
    }

    const account = alert.textFieldValue(0);
    const password = alert.textFieldValue(1);

    if (!account || !password) {
        throw new Error("账号或密码不能为空");
    }

    try {
        const client = new PaperGamesClient(cryptoLib);
        const loginResult = await client.login(account, password);

        const userId = loginResult.nid || loginResult.user_id;
        const token = loginResult.token;
        const refreshToken = loginResult.refresh_token;
        if (token && userId) {
            Keychain.set(KEY_MOMO_TOKEN, token);
            Keychain.set(KEY_MOMO_NID, String(userId));
            if (refreshToken) {
                Keychain.set(KEY_MOMO_REFRESH_TOKEN, refreshToken);
            }
            return true;
        } else {
            let errorMsg = "登录失败: 未能获取 Token 或 NID";
            if (loginResult && loginResult.info) {
                errorMsg += " (" + loginResult.info + ")";
            }
            throw new Error(errorMsg);
        }
    } catch(e) {
        throw new Error("登录过程出错: " + e.message);
    }
}

/**
 * 处理 Snappy 压缩数据
 * @param {Object} requestData 包含 token 和 openid 的对象
 * @returns {Promise<Object>} 解码后的游戏数据
 */
async function fetchNikkiData(requestData) {
    try {
        const req = new Request(NIKKI_API_URL);
        req.method = "POST";
        req.headers = {
            "Cookie": `momoToken = ${requestData.token};
            momoNid = ${requestData.openid}`,
            "Content-Type": "application/json"
        };

        const bodyData = {
            client_id: 1106,
            token: requestData.token,
            openid: requestData.openid
        };
        req.body = JSON.stringify(bodyData);

        const rawData = await req.load();
        const base64Data = rawData.toBase64String();

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
                throw new Error(`API错误: [${directJson.code}] ${directJson.info}`);
            }
        } catch(jsonError) {
            if (jsonError.message === "需要重新登录") {
                throw jsonError;
            }
        }
        
        // Snappy 解码
        const result = decodeSnappyBase64ToJson(base64Data);
        if (!result) throw new Error("Snappy 解码失败");
        if (result.flag && result.flag !== 0) throw new Error(`API返回错误, Flag: ${result.flag}`);
        if (!result.info_from_gm) throw new Error("API 响应缺少数据");

        return result.info_from_gm;

    } catch(error) {
        console.log("❌ 获取游戏数据失败: " + error.message);
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
    } catch(e) {
        console.error("获取用户信息失败:" + e);
    }
    return {
        nickname: null,
        avatar: null,
        level: null
    };
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
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).replace(/\//g, '/');
    }
    const fullMinutes = needEnergy * MINUTES_PER_ENERGY;
    const fullTime = new Date(Date.now() + fullMinutes * 60000);
    return fullTime.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
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
        const TEN_MINUTES_MS = 5 * 60 * 1000;
        const TWO_MINUTE_MS = 2 * 60 * 1000;

        // 检查体力
        const needEnergy = MAX_ENERGY - currentEnergy;
        if (needEnergy > 0) {
            const fullMs = needEnergy * MINUTES_PER_ENERGY * 60 * 1000;
            const fullTime = new Date(now.getTime() + fullMs);

            if (fullMs > TEN_MINUTES_MS) {
                const triggerTime = new Date(fullTime.getTime() - TEN_MINUTES_MS);
                if (triggerTime > now) {
                    notificationsToSend.push({
                        id: "energy_10m",
                        title: `亲爱的搭配师${nickname}❤️`,
                        body: "体力将在10分钟内回满，请及时清理～",
                        triggerTime: triggerTime
                    });
                }
            }
            if (fullMs > TWO_MINUTE_MS) {
                const triggerTime = new Date(fullTime.getTime() - TWO_MINUTE_MS);
                if (triggerTime > now) {
                    notificationsToSend.push({
                        id: "energy_2m",
                        title: `亲爱的搭配师${nickname}❤️`,
                        body: "体力即将回满，请及时清理～",
                        triggerTime: triggerTime
                    });
                }
            }
        }
        // 检查挖掘
        if (dispatchTasks && Array.isArray(dispatchTasks) && dispatchTasks.length > 0) {
            const task = dispatchTasks[0];
            const hoursMap = {
                1 : 4,
                2 : 8,
                3 : 12,
                4 : 20
            };
            const hours = hoursMap.hasOwnProperty(task.spend_time) ? hoursMap[task.spend_time] : task.spend_time;
            const endTime = new Date(task.start_time * 1000 + hours * 60 * 60 * 1000);
            const remainingMs = endTime.getTime() - now.getTime();

            if (remainingMs > 0) {
                if (remainingMs > TEN_MINUTES_MS) {
                    const triggerTime = new Date(endTime.getTime() - TEN_MINUTES_MS);
                    if (triggerTime > now) {
                        notificationsToSend.push({
                            id: "dig_10m",
                            title: `亲爱的搭配师${nickname}❤️`,
                            body: "挖掘将在10分钟内完成，请及时收获～",
                            triggerTime: triggerTime
                        });
                    }
                }
                if (remainingMs > TWO_MINUTE_MS) {
                    const triggerTime = new Date(endTime.getTime() - TWO_MINUTE_MS);
                    if (triggerTime > now) {
                        notificationsToSend.push({
                            id: "dig_2m",
                            title: `亲爱的搭配师${nickname}❤️`,
                            body: "挖掘即将完成，请及时收获～",
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
    } catch(error) {
        console.error("❌ 检查或发送通知时出错:" + error);
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
    } catch(error) {
        console.error("❌ 清理通知时出错:" + error);
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
    } catch(error) {
        console.error("❌ 安排通知失败:" + error);
    }
}

function addStatusRow(widget, label, currentValue, maxValue, completedText = COMPLETED_TEXT, isBooleanStatus = false, isChallengeStatus = false) {
    const row = widget.addStack();
    row.layoutHorizontally();

    const labelElement = row.addText(label);
    labelElement.font = TEXT_FONT;
    labelElement.textColor = LABEL_COLOR;
    row.addSpacer(4);

    let displayText,
    textColor;

    if (isBooleanStatus || isChallengeStatus) {
        const isComplete = currentValue === 1 || currentValue === true;
        if (isComplete) {
            displayText = completedText;
            textColor = COMPLETED_COLOR;
        } else {
            displayText = isChallengeStatus ? '未挑战': '未完成';
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
        let storedRefreshToken = null;

        // 从 Keychain 获取存储的凭据
        try {
            if (Keychain.contains(KEY_MOMO_TOKEN)) storedToken = Keychain.get(KEY_MOMO_TOKEN);
            if (Keychain.contains(KEY_MOMO_NID)) storedOpenid = Keychain.get(KEY_MOMO_NID);
            if (Keychain.contains(KEY_MOMO_REFRESH_TOKEN)) storedRefreshToken = Keychain.get(KEY_MOMO_REFRESH_TOKEN);
        } catch(e) {
            console.warn("读取 Keychain 时发生错误:", e);
        }

        if (!storedToken || !storedOpenid) {
            if (config.runsInWidget) {
                throw new Error("登录已过期，请在Scriptable中重新登录");
            } else {
                await promptLogin();
                storedToken = Keychain.get(KEY_MOMO_TOKEN);
                storedOpenid = Keychain.get(KEY_MOMO_NID);
                // 获取 refresh token
                if (Keychain.contains(KEY_MOMO_REFRESH_TOKEN)) {
                    storedRefreshToken = Keychain.get(KEY_MOMO_REFRESH_TOKEN);
                }
            }
        }

        if (storedToken && storedOpenid) {
            requestData = {
                token: storedToken,
                openid: storedOpenid
            };
        } else {
            throw new Error("无法获取有效的认证凭据");
        }

        let data;
        try {
            data = await fetchNikkiData(requestData);
        } catch(error) {
            // === 刷新 Token ===
            if (error.message === "需要重新登录") {
                if (storedRefreshToken) {
                    try {
                        const cryptoLib = await loadCryptoLibrary();
                        const client = new PaperGamesClient(cryptoLib);
                        const refreshResult = await client.refreshToken(storedToken, storedRefreshToken);

                        if (refreshResult && refreshResult.token) {
                            Keychain.set(KEY_MOMO_TOKEN, refreshResult.token);
                            storedToken = refreshResult.token;

                            if (refreshResult.refresh_token) {
                                Keychain.set(KEY_MOMO_REFRESH_TOKEN, refreshResult.refresh_token);
                                storedRefreshToken = refreshResult.refresh_token;
                            }

                            requestData.token = storedToken;
                            data = await fetchNikkiData(requestData);
                        } else {
                            console.error("自动刷新失败");
                            throw error;
                        }
                    } catch(refreshErr) {
                        console.error("自动刷新过程异常: " + refreshErr.message);
                        if (config.runsInWidget) {
                            throw new Error("登录过期且自动刷新失败，请重新登录");
                        } else {
                            Keychain.remove(KEY_MOMO_NID);
                            Keychain.remove(KEY_MOMO_TOKEN);
                            Keychain.remove(KEY_MOMO_REFRESH_TOKEN);

                            await promptLogin();
                            const newToken = Keychain.get(KEY_MOMO_TOKEN);
                            const newOpenId = Keychain.get(KEY_MOMO_NID);
                            requestData = {
                                token: newToken,
                                openid: newOpenId
                            };
                            data = await fetchNikkiData(requestData);
                            if (Keychain.contains(KEY_MOMO_REFRESH_TOKEN)) {
                                storedRefreshToken = Keychain.get(KEY_MOMO_REFRESH_TOKEN);
                            }
                        }
                    }
                } else {
                    if (config.runsInWidget) {
                        throw new Error("登录过期，请在Scriptable中重新登录");
                    } else {
                        await promptLogin();
                    }
                }
            } else {
                throw error;
            }
        }

        // 获取服务器时间（用于体力计算）
        let serverTimeMs;
        try {
            const timeReq = new Request('https://chaos.papegames.com/system/time');
            const timeRes = await timeReq.loadJSON();
            serverTimeMs = timeRes.timestamp;
        } catch(timeErr) {
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

        // 计算日常和星海进度
        const actualDailyTask = calculateDailyTask(data, serverTimeMs);
        const actualStarSea = calculateStarSea(data, serverTimeMs);

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
            } catch(e) {
                console.error("加载或处理头像失败:" + e);
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
            const nicknameText = nicknameAndLevelRow.addText(`${nickname} Lv.${level}`);
            nicknameText.textColor = VALUE_COLOR;
            nicknameText.font = TEXT_FONT;
            widget.addSpacer(3);
        }

        addStatusRow(widget, "日常:", actualDailyTask, 500);
        addStatusRow(widget, "星海:", actualStarSea, 500);
        addStatusRow(widget, "周本:", data.weekly_reward_status, null, '已挑战', true, true);

        const energyRow = widget.addStack();
        energyRow.layoutHorizontally();
        const energyLabel = energyRow.addText("体力:");
        energyLabel.font = TEXT_FONT;
        energyLabel.textColor = LABEL_COLOR;
        energyRow.addSpacer(4);

        const isEnergyFull = currentEnergy >= MAX_ENERGY;
        const energyValueText = isEnergyFull ? "已恢复满格!": `${currentEnergy}`;
        const energyValue = energyRow.addText(energyValueText);
        energyValue.font = Font.regularMonospacedSystemFont(12);
        energyValue.textColor = isEnergyFull ? COMPLETED_COLOR: VALUE_COLOR;
        energyRow.addSpacer();

        if (!isEnergyFull) {
            const energyFullTime = energyRow.addText(fullEnergyTimeStr);
            energyFullTime.font = TIME_FONT;
            energyFullTime.textColor = TIME_COLOR;
        }
        widget.addSpacer(3);

        const digRow = widget.addStack();
        digRow.layoutHorizontally();

        const currentTaskCount = (data.dispatch && Array.isArray(data.dispatch)) ? data.dispatch.length: 0;
        if (currentTaskCount > 0) {
            const task = data.dispatch[0];
            const hoursMap = {
                1 : 4,
                2 : 8,
                3 : 12,
                4 : 20
            };
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
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
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

        widget.addSpacer(6);
        const refreshInfoRow = widget.addStack();
        refreshInfoRow.layoutHorizontally();
        refreshInfoRow.centerAlignContent();
        const lastRefreshDate = new Date();
        const lastRefreshTimeStr = lastRefreshDate.toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).replace(/\//g, '/');
        const refreshInfoText = refreshInfoRow.addText(`上次刷新: ${lastRefreshTimeStr}`);
        refreshInfoText.font = TIME_FONT;
        refreshInfoText.textColor = TIME_COLOR;

        return widget;
    } catch(err) {
        console.log("创建小组件时发生错误:" + err);
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

        if (err.message.includes("登录已过期") || err.message.includes("请在Scriptable中")) {
            const hint1 = widget.addText("登录状态已过期");
            const hint2 = widget.addText("请在Scriptable中重新登录");
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
    } catch(e) {
        console.error("设置小组件时发生未捕获的错误:" + e);
    }
} else {
    const mainAlert = new Alert();
    mainAlert.title = "无限暖暖小组件";
    mainAlert.message = "请选择操作：";
    mainAlert.addAction("🔍 预览小组件/重新登录");
    mainAlert.addAction("🗑️ 清除所有登录信息");
    mainAlert.addCancelAction("❌ 取消");
    const mainResponse = await mainAlert.present();

    if (mainResponse === 0) {
        try {
            const widget = await createWidget();
            await widget.presentSmall();
        } catch(e) {
            const errorAlert = new Alert();
            errorAlert.title = "预览失败";
            errorAlert.message = `无法生成小组件: ${e.message}`;
            errorAlert.addAction("确定");
            await errorAlert.present();
        }
    } else if (mainResponse === 1) {
        try {
            let removedKeys = [];
            const keysToRemove = [KEY_MOMO_TOKEN, KEY_MOMO_NID, KEY_MOMO_REFRESH_TOKEN];

            for (const key of keysToRemove) {
                if (Keychain.contains(key)) {
                    Keychain.remove(key);
                    removedKeys.push(key);
                }
            }

            const successAlert = new Alert();
            successAlert.title = "成功";
            successAlert.message = removedKeys.length > 0 ? "已清除登录信息OvO": "你好像还没登录Ovo";
            successAlert.addAction("确定");
            await successAlert.present();
        } catch(e) {
            console.error(e);
        }
    }
}
Script.complete();
