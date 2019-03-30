const electron = require('electron')
const path = require('path')
const fs = require('fs')


// TODO: changing data path when userid is gained when using the application
//       rather than when at the start of the application

class Store {
    constructor(opts) {
        this.appDataPath = (electron.app || electron.remote.app).getPath('userData')
        this.configPath = path.join(this.appDataPath, opts.configName + '.json')
        this.config = parseDataFile(this.configPath, opts.defaults)
        if (!this.config['currentUserID']) {
            // no current user
            this.dataPath = path.join(this.appDataPath, 'tempUser')
            if (!fs.existsSync(this.dataPath)) {
                fs.mkdirSync(this.dataPath)
            }
        } else {
            this.dataPath = path.join(this.appDataPath, this.config['currentUserID'])
            // if `currentUserID` exists, then the corresponding directory should always be existed,
            // so there is no need to check the existance of the user directory.
        }
    }

    createNewUser(userID) {
        this.setConfig('currentUserID', userID)
        if (!this.getConfig('usersID')) {
            this.setConfig('usersID', [userID])
        } else {
            let usersID = this.getConfig('usersID')
            usersID.push(userID)
            this.setConfig('usersID', usersID)
        }
        this.dataPath = path.join(this.appDataPath, userID)
        // check if `tempUser` exists,
        // if so, rename it to current user's data directory
        if (fs.existsSync(path.join(this.appDataPath, 'tempUser'))) {
            fs.renameSync(path.join(this.appDataPath, 'tempUser'), this.dataPath)
        }
    }

    getConfig(key) {
        return this.config[key]
    }

    setConfig(key, val) {
        this.config[key] = val
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config))
            return { status: true, info: '' }
        } catch (error) {
            return { status: false, info: error }
        }
    }
}

function parseDataFile(filePath, defaults) {
    try {
        return JSON.parse(fs.readFileSync(filePath))
    } catch (error) {
        return defaults
    }
}

// expose the class
module.exports = Store