const electron = require('electron')
const path = require('path')
const fs = require('fs')


// TODO: changing data path when userid is gained when using the application
//       rather than when at the start of the application

class Store {
    constructor(opts) {
        this.appDataPath = (electron.app).getPath('userData')
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
        } else {
            fs.mkdirSync(this.dataPath)
        }
    }

    getConfig(key, defaultValue) {
        return this.config[key] || defaultValue
    }

    setConfig(key, val) {
        this.config[key] = val
        fs.writeFileSync(this.configPath, JSON.stringify(this.config))
        return { status: true, info: '' }
    }

    /* Document related operations */

    getExistedDocuments() {
        const dirs = p => fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory())
        let documents = []
        for (const dirpath of dirs(this.dataPath)) {
            let statPath = path.join(this.dataPath, dirpath, 'stat.json')
            let stat = JSON.parse(fs.readFileSync(statPath))
            documents.push({
                name: stat.name,
                id: stat.id
            })
        }
        return documents
    }

    getOneDocumentData(documentID) {
        let documentDir = path.join(this.dataPath, documentID)
        let documentStatFile = path.join(documentDir, 'stat.json')
        let documentPath = path.join(documentDir, 'document.html')
        var htmlContent = ''
        if (fs.existsSync(documentPath)) {
            htmlContent = fs.readFileSync(documentPath)
        }
        let stat = JSON.parse(fs.readFileSync(documentStatFile))
        return { documentContent: htmlContent, stat: stat }
    }

    createDocument(documentID, name) {
        let documentDir = path.join(this.dataPath, documentID)
        let documentStatFile = path.join(documentDir, 'stat.json')
        fs.mkdirSync(documentDir)
        let stat = {id: documentID, name: name, createTime: Date.now().toString()}
        fs.writeFileSync(documentStatFile, JSON.stringify(stat))
    }

    updateDocument(updateOptions) {
        let { id, htmlContent, name, templateName, args, partArguments, image } = updateOptions
        if (!id) {
            return
        }
        // TODO: check if this id existed
        let documentDir = path.join(this.dataPath, id)
        if (htmlContent) {
            let documentPath = path.join(documentDir, 'document.html')
            fs.writeFileSync(documentPath, htmlContent)
        }
        let statPath = path.join(documentDir, 'stat.json')
        let stat = JSON.parse(fs.readFileSync(statPath))
        if (name) {
            stat['name'] = name
        }
        if (templateName) {
            stat['template'] = templateName
        }
        if (args) {
            let argNames = Object.keys(args)
            if (!stat['args']) {
                stat['args'] = {}
            }
            for (const name of argNames) {
                const value = args[name]
                stat['args'][name] = value
            }
        }
        if (partArguments) {
            let { name, value } = partArguments
            if (!stat['partArguments']) {
                stat['partArguments'] = {}
            }
            stat['partArguments'][name] = value
        }
        fs.writeFileSync(statPath, JSON.stringify(stat))
        if (image) {
            const imageDirPath = path.join(documentDir, 'images')
            if (!fs.existsSync(imageDirPath)) {
                fs.mkdirSync(imageDirPath)
            }
            const imagePath = path.join(imageDirPath, image.name)
            fs.writeFileSync(imagePath, image.data)
        }
        return true
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