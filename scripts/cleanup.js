const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
  const outDir = context.outDir; // 打包输出目录，如 'dist'

  if (!fs.existsSync(outDir)) return;

  const items = fs.readdirSync(outDir, { withFileTypes: true });

  items.forEach(item => {
    const itemPath = path.join(outDir, item.name);
    
    // 判断逻辑：如果是目录，直接删除；如果是文件，只保留安装包后缀
    if (item.isDirectory()) {
      try {
        fs.rmSync(itemPath, { recursive: true, force: true });
        console.log(`🗑️ 已删除目录: ${item.name}`);
      } catch (e) {
        console.error(`❌ 删除目录失败 ${item.name}:`, e.message);
      }
    } else {
      // 保留常见的安装包格式，其余文件（如 .yml, .blockmap）一律删除
      const keepExtensions = ['.exe', '.msi', '.dmg', '.zip', '.AppImage'];
      const ext = path.extname(item.name).toLowerCase();
      
      if (!keepExtensions.includes(ext)) {
        try {
          fs.unlinkSync(itemPath);
          console.log(`🗑️ 已删除文件: ${item.name}`);
        } catch (e) {
          console.error(`❌ 删除文件失败 ${item.name}:`, e.message);
        }
      }
    }
  });
};