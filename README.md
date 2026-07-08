<p align="center"><img src="public/logo.png" alt="追番计划" width="96" /></p>

# 追番计划

基于 [Bangumi](https://bgm.tv) API 的 Windows 桌面端追番记录应用。

<p align="left">
  <img src="https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/shadcn%2Fui-black?logo=shadcnui&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/TanStack_Query-FF4154?logo=reactquery&logoColor=white&style=flat-square" />
</p>

<p align="center">
  <table>
    <tr>
      <td><img src="images/追番.webp" alt="追番" /></td>
      <td><img src="images/收藏.webp" alt="收藏" /></td>
    </tr>
    <tr>
      <td align="center"><sub>追番</sub></td>
      <td align="center"><sub>收藏</sub></td>
    </tr>
  </table>
</p>

<p align="center">
  <table>
    <tr>
      <td><img src="images/新番-表格.webp" alt="新番-表格" /></td>
      <td><img src="images/新番-列表.webp" alt="新番-列表" /></td>
    </tr>
    <tr>
      <td align="center"><sub>新番-表格</sub></td>
      <td align="center"><sub>新番-列表</sub></td>
    </tr>
  </table>
</p>

## 首次使用

1. 到 [Bangumi 开发者平台](https://bgm.tv/dev/app) 创建一个新应用
   - 应用名：Anime Watchlist
   - 主页地址：https://github.com/GitZhiQing/anime-watchlist
   - 类型：应用
   - 简介：一个基于 Bangumi API 的追番列表桌面应用。
   - 跨域请求：不勾选
2. 启动应用 →「配置」→ 填入平台生成的 App ID 与 App Secret
3. 点击「Bangumi 认证」，浏览器授权后回到应用即完成

## 开发

```bash
npm install
npm run tauri dev    # 开发模式
npm run tauri build  # 打包 Windows 安装包
```

## 说明

所有收藏默认**私密**，目前不支持更改。

本应用展示的全部内容（条目信息、封面、简介、评分等）均来自 Bangumi，版权归 Bangumi 及其贡献者所有。你的收藏数据存储在 Bangumi 账户中，本地仅保存 OAuth 凭据与界面偏好。

本应用为第三方开源项目，与 Bangumi 无官方隶属关系。
