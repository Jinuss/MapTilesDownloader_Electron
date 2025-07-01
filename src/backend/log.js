const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// 格式化日期
function formatDateTime(date = new Date()) {
    return date.toISOString().replace('T', ' ').replace(/\..+/, '');
}

class Logger {
    constructor({ logPath, fileName }) {
        this.logPath = path.join(logPath || app.getPath('userData'), fileName || 'application.txt');
        this.createLogFile()
    }
    createLogFile() {
        try {
            fs.writeFileSync(this.logPath, '', 'utf-8');
        } catch (error) {
            console.error('日志文件创建失败', error);
        }
    }
    // 清空日志
    clearLogs() {
        try {
            fs.writeFileSync(this.logPath, '', 'utf-8');
            return true;
        } catch (error) {
            return false;
        }
    }

    // 读取日志内容
    readLogs() {
        try {
            return fs.readFileSync(this.logPath, 'utf-8');
        } catch (error) {
            return '暂无日志内容';
        }
    }
    getLogPath() {
        return this.logPath
    }
    info(message, ...args) {
        this.writeLog('info', message, ...args)
    }
    error(message, ...args) {
        this.writeLog('error', message, ...args)
    }
    warn(message, ...args) {
        this.writeLog('warn', message, ...args)
    }
    writeLog(level, message, ...args) {
        try {
            const logData = [
                `[${formatDateTime()}]`,
                `[${level.toUpperCase()}]`,
                message,
                ...args.map(arg =>
                    arg instanceof Error ? arg.stack :
                        typeof arg === 'object' ? JSON.stringify(arg) : arg
                )
            ].join(' ');
            fs.appendFileSync(this.logPath, logData + '\n', 'utf-8');
        } catch (error) {
            console.error('日志写入失败', error);
        }
    }
}

module.exports = Logger