const {app, BrowserWindow} = require('electron')
const path = require('path')
const url = require('url')
const request = require('request');
const config = require("./config.json")

let window = null

// Wait until the app is ready
app.once('ready', () => {
  // Create a new window
  window = new BrowserWindow({
    width: 1300,
    height: 900,
    // Set the default background color of the window to match the CSS
    // background color of the page, this prevents any white flickering
    backgroundColor: "#D6D8DC",
    // Don't show the window until it's ready, this prevents any white flickering
    show: false
  })

  // Load a URL in the window to the local index.html path
  window.loadURL(url.format({
    pathname: path.join(__dirname, 'app/editor.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Show window when page is ready
  window.once('ready-to-show', () => {
    window.show()
  })
})

// setup base request with api base setted and json option enabled
console.log("api: " + config.apiBase)
const baseRequest = request.defaults({
    'baseUrl': config.apiBase,
    'json': true
})
global.baseRequest = baseRequest

// get user id, request if not exist
console.log("user id: " + config.userId)
if (config.userId == undefined) {
    baseRequest.post('/users', function(error, response, jsonBody) {
        if (error) {
            console.log(error)
            global.userId = ""
        } else {
            console.log('user id:', jsonBody['user_id'])
            config.userId = jsonBody['user_id']
            global.userId = config.userId
            const fs = require('fs')
            fs.writeFile('./config.json', JSON.stringify(config), err => {
                if (err) {
                    console.log('save config file error:', err)
                } else {
                    console.log('user id has saved into config.')
                }
            })
        }
    })
} else {
    // read from file
    global.userId = config.userId
}

// variable storing templates
// TODO: store locally
global.templateArgs = {}

global.currentCompilingTask = ""

const { ipcMain } = require("electron")

ipcMain.on("alert", (event, arg) => {
    console.log(arg)
    event.returnValue = 'pong'
})

ipcMain.on("load-page", (event, arg) => {
    console.log("load page:", arg)
    if (arg == "editor") {
        window.loadURL(url.format({
            pathname: path.join(__dirname, "app/editor.html"),
            protocol: "file:",
            slashes: true
        }))
    }
})

// add a compile task
ipcMain.on("add-task", (event, arg) => {
    console.log("add task:", arg)
    global.currentCompilingTask = arg
    event.returnValue = "done"
})

// pop up a page
ipcMain.on("pop-page", (event, arg) => {
    if (arg == "pdfviewer") {
        let child = new BrowserWindow({parent: window, modal: true, show: true});
        child.loadURL(url.format({
            pathname: path.join(__dirname, "app/pdfviewer.html"),
            protocol: "file:",
            slashes: true
        }))
    }
})