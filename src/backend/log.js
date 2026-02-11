const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

// 格式化日期
function formatDateTime(date = new Date()) {
    return date.toISOString().replace('T', ' ').replace(/\..+/, '');
}

class Logger {
    constructor({ logPath, fileName }) {
        this.logPath = path.join(logPath || app.getPath('userData'), fileName || 'application.txt');
        this.writeQueue = [];  // 写入队列
        this.isWriting = false;  // 是否正在写入
        this.maxRetries = 3;  // 最大重试次数
        this.retryDelay = 100;  // 重试延迟（毫秒）
        
        // 确保日志目录存在
        this.ensureLogFile();
        
        // 监听进程退出，确保所有日志都写入
        if (process.type === 'browser') {  // 主进程
            app.on('before-quit', async () => {
                await this.flushQueue();
            });
        }
    }
    
    // 确保日志文件和目录存在
    async ensureLogFile() {
        try {
            const dir = path.dirname(this.logPath);
            try {
                await fs.access(dir);
            } catch (err) {
                await fs.mkdir(dir, { recursive: true });
            }
            
            try {
                await fs.access(this.logPath);
            } catch (err) {
                await fs.writeFile(this.logPath, '', 'utf-8');
            }
        } catch (error) {
            console.error('日志文件初始化失败', error);
        }
    }
    
    // 清空日志
    clearLogs() {
        try {
            // 先清空队列
            this.writeQueue = [];
            
            // 使用 fs.promises 异步写入
            return fs.writeFile(this.logPath, '', 'utf-8')
                .then(() => true)
                .catch(() => false);
        } catch (error) {
            console.error('清空日志失败', error);
            return false;
        }
    }
    
    // 读取日志内容
    readLogs() {
        try {
            return fs.readFile(this.logPath, 'utf-8')
                .then(content => content)
                .catch(() => '暂无日志内容');
        } catch (error) {
            return Promise.resolve('暂无日志内容');
        }
    }
    
    getLogPath() {
        return this.logPath;
    }
    
    info(message, ...args) {
        this.writeLog('info', message, ...args);
    }
    
    error(message, ...args) {
        this.writeLog('error', message, ...args);
    }
    
    warn(message, ...args) {
        this.writeLog('warn', message, ...args);
    }
    
    // 写入日志的核心方法
    writeLog(level, message, ...args) {
        const logData = [
            `[${formatDateTime()}]`,
            `[${level.toUpperCase()}]`,
            message,
            ...args.map(arg =>
                arg instanceof Error ? arg.stack :
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            )
        ].join(' ') + '\n';
        
        // 将日志条目加入队列
        this.writeQueue.push(logData);
        
        // 异步处理队列
        this.processQueue();
    }
    
    // 处理写入队列
    async processQueue() {
        // 如果已经在处理队列，则直接返回
        if (this.isWriting || this.writeQueue.length === 0) {
            return;
        }
        
        this.isWriting = true;
        
        while (this.writeQueue.length > 0) {
            const logEntry = this.writeQueue.shift();
            const success = await this.writeWithRetry(logEntry);
            
            if (!success) {
                // 如果写入失败，将日志条目放回队列开头等待重试
                this.writeQueue.unshift(logEntry);
                
                // 等待一段时间后重试
                await new Promise(resolve => 
                    setTimeout(resolve, this.retryDelay)
                );
                
                // 如果重试多次仍然失败，跳过这条日志
                if (this.retryCount >= this.maxRetries) {
                    console.error('日志写入失败，已超过最大重试次数:', logEntry.trim());
                    this.writeQueue.shift();  // 从队列中移除
                }
            }
        }
        
        this.isWriting = false;
    }
    
    // 带重试的写入
    async writeWithRetry(logEntry) {
        let retryCount = 0;
        
        while (retryCount < this.maxRetries) {
            try {
                await this.writeToFile(logEntry);
                return true;
            } catch (error) {
                retryCount++;
                
                if (error.code === 'EBUSY' || error.code === 'EAGAIN') {
                    // 文件被占用，等待后重试
                    const delay = Math.min(
                        this.retryDelay * Math.pow(2, retryCount - 1),  // 指数退避
                        5000  // 最大延迟5秒
                    );
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                console.error('写入日志文件失败:', error.message);
                return false;
            }
        }
        
        return false;
    }
    
    // 实际的文件写入操作
    async writeToFile(data) {
        // 使用追加模式打开文件
        const fd = await fs.open(this.logPath, 'a');
        try {
            // 获取文件信息，可以添加大小检查逻辑
            const stats = await fd.stat();
            
            // 可以在这里添加日志轮转逻辑
            if (stats.size > 10 * 1024 * 1024) {  // 10MB
                await this.rotateLog();
            }
            
            // 写入数据
            await fd.write(data, 0, 'utf-8');
        } finally {
            // 确保文件描述符被关闭
            await fd.close();
        }
    }
    
    // 日志轮转
    async rotateLog() {
        try {
            const timestamp = new Date().toISOString()
                .replace(/[:.]/g, '-')
                .replace('T', '_');
            
            const backupPath = `${this.logPath}.${timestamp}.bak`;
            
            // 重命名当前日志文件
            try {
                await fs.rename(this.logPath, backupPath);
            } catch (err) {
                // 如果重命名失败，可能是文件不存在或被占用
                console.warn('日志轮转失败:', err.message);
                return;
            }
            
            // 创建新的日志文件
            await fs.writeFile(this.logPath, '', 'utf-8');
            
            // 保留最近5个备份文件
            await this.cleanupOldLogs();
        } catch (error) {
            console.error('日志轮转失败', error);
        }
    }
    
    // 清理旧的日志文件
    async cleanupOldLogs() {
        try {
            const dir = path.dirname(this.logPath);
            const files = await fs.readdir(dir);
            
            const logFiles = files
                .filter(f => f.startsWith(path.basename(this.logPath)) && f.endsWith('.bak'))
                .map(f => ({
                    name: f,
                    path: path.join(dir, f),
                    time: fs.stat(path.join(dir, f)).then(stat => stat.mtime.getTime())
                }));
            
            // 按修改时间排序
            const sortedFiles = await Promise.all(
                logFiles.map(async file => ({
                    ...file,
                    time: await file.time
                }))
            );
            
            sortedFiles.sort((a, b) => a.time - b.time);
            
            // 保留最近5个文件
            for (let i = 0; i < sortedFiles.length - 5; i++) {
                await fs.unlink(sortedFiles[i].path);
            }
        } catch (error) {
            // 清理失败不影响主流程
            console.warn('清理旧日志失败:', error.message);
        }
    }
    
    // 确保所有日志都写入文件
    async flushQueue() {
        if (this.writeQueue.length > 0) {
            console.log(`等待 ${this.writeQueue.length} 条日志写入...`);
            
            // 设置一个超时，避免无限等待
            const timeout = 5000;  // 5秒超时
            const startTime = Date.now();
            
            while (this.writeQueue.length > 0 && Date.now() - startTime < timeout) {
                await this.processQueue();
                if (this.writeQueue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            if (this.writeQueue.length > 0) {
                console.warn(`仍有 ${this.writeQueue.length} 条日志未写入`);
            }
        }
    }
    
    // 同步版本的方法（保持向后兼容）
    clearLogsSync() {
        try {
            fs.writeFileSync(this.logPath, '', 'utf-8');
            this.writeQueue = [];  // 清空队列
            return true;
        } catch (error) {
            console.error('同步清空日志失败', error);
            return false;
        }
    }
    
    readLogsSync() {
        try {
            return fs.readFileSync(this.logPath, 'utf-8');
        } catch (error) {
            return '暂无日志内容';
        }
    }
    
    // 提供同步写入的方法（仅供特殊情况使用）
    writeLogSync(level, message, ...args) {
        const logData = [
            `[${formatDateTime()}]`,
            `[${level.toUpperCase()}]`,
            message,
            ...args.map(arg =>
                arg instanceof Error ? arg.stack :
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            )
        ].join(' ') + '\n';
        
        try {
            fs.appendFileSync(this.logPath, logData, 'utf-8');
        } catch (error) {
            console.error('同步写入日志失败', error);
            // 如果同步写入失败，放入队列异步重试
            this.writeLog(level, message, ...args);
        }
    }
}

module.exports = Logger;