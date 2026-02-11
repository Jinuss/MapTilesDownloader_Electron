const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const path = require("path");

module.exports = {
  packagerConfig: {
    name: "mapTilesDownloader",
    overwrite: true,
    // 关键：排除输出目录，避免循环复制
    ignore: [
      // 排除 out 目录
      /^\/out$/,
      // 排除 node_modules 以外的临时文件（可选）
      /^\/\.git/,
      /^\/\.vscode/,
      /^\/node_modules/,
      // 排除打包配置文件（可选）
      /^\/forge\.config\.js$/,
    ],
  },
  // 自定义输出目录（可选，避免和源目录冲突）
  out: path.resolve(__dirname, "electron-out"),

  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "mapTilesDownloader",
        noMsi: true,
        skipCleanup: true,
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
  ],
  plugins: [
    // {
    //   name: "@electron-forge/plugin-auto-unpack-natives",
    //   config: {},
    // },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
