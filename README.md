# InfinityNikki-Scriptable-Widget

### 一个使用 [Scriptable](https://apps.apple.com/us/app/scriptable/id1405459188) 制作的无限暖暖小组件

当前支持：

- 昵称、等级、头像显示

- 日常、星海、周本的完成进度显示

- 体力、挖掘的剩余时间显示

- 自动刷新用户凭据

~~WIP：~~

~~研究这个cookie怎么续上，两三天登录就过期了。官方的美鸭梨页面也是，，叠纸你就不能给个时间长点的吗~~

---

## 🐶叠加密与签名机制说明

### 1. 配置信息

根据前端 `common.1dea5bc8.chunk.js` 中的变量 `Tm` 可得：

- **App ID**：`1010013`
- **App Key**：`NsalbZh76U8VGJp1`
- **AES Key**：`ZTM7fu0xYnzkE5Km`

---

### 2. 加密逻辑

#### 2.1 加密流程

1. 将请求体数据（账号、密码）封装为 **JSON 字符串**
2. 使用 **AES-128-CBC** 进行加密
3. 使用 **PKCS7** 填充
4. 使用密钥参数：
   - **Key**：`ZTM7fu0xYnzkE5Km`
   - **IV**：密钥前 16 个字符 `ZTM7fu0xYnzkE5Km`
5. 加密后内容进行 **Base64 编码**
6. 最终作为 `data` 参数提交

#### 2.2 加密参数

| 参数 | 值 |
|------|------|
| 加密算法 | AES-128-CBC |
| 填充方式 | PKCS7 |
| Key | `ZTM7fu0xYnzkE5Km` |
| IV | `ZTM7fu0xYnzkE5Km`（前 16 字符） |
| 输出格式 | Base64 |

---

### 3. 解密逻辑（响应 data 字段）

服务器返回的响应数据的 `data` 字段也采用同样方式加密。

#### 3.1 解密流程

1. 获取响应中 `data` 字段（Base64 字符串）
2. 对其进行 Base64 解码
3. 使用 AES-128-CBC 进行解密
4. 得到明文 JSON 字符串并解析

#### 3.2 解密参数

| 参数 | 值 |
|------|------|
| 加密算法 | AES-128-CBC |
| Key | `ZTM7fu0xYnzkE5Km` |
| IV | `ZTM7fu0xYnzkE5Km` |
| 输入格式 | Base64 |

---

### 4. 签名逻辑

签名用于校验请求的完整性，采用 **HMAC-MD5**。

#### 4.1 签名步骤

1. 收集所有请求参数：  
   包括 `app_id`、`timestamp`、`sign_type`、`clientid`、`lang` 等  
   **不包含**：`data`、`sign`

2. 按 **ASCII 升序** 对参数名进行排序

3. 使用以下格式拼接参数字符串：

```
key=value&key=value&...
```

- 值需进行 URL 编码

4. 示例拼接后的字符串：

```
app_id=1010013&clientid=1106&lang=zh-cn&sign_type=hmac&timestamp=****
```

5. 使用 **App Key**：`NsalbZh76U8VGJp1`  
   执行 **HMAC-MD5** 运算

6. 输出 **32 位十六进制字符串** 作为最终签名 `sign`

#### 4.2 签名参数

| 参数 | 值 |
|------|------|
| 签名算法 | HMAC-MD5 |
| 签名密钥 | `NsalbZh76U8VGJp1` |
| 排序方式 | ASCII 升序 |
| 拼接格式 | `key=value` 使用 `&` 拼接 |
| 排除字段 | data、sign |

---


![IMG](https://github.com/user-attachments/assets/4e341c29-6e53-4684-b299-dde36054b5a4)
