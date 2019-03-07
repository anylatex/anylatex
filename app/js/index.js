const { ipcRenderer } = require('electron')
const remote = require('electron').remote

function showLoginForm() {
    // hide buttons
    $("div#buttons").fadeOut()
    // show form
    $("button#submit").text("登录")
    $("button#submit").val("login")
    $("div#form").removeClass("d-none")
    $("div#form").fadeIn()
}

function showRegisterForm() {
    // hide buttons
    $("div#buttons").fadeOut()
    // show form
    $("button#submit").text("注册")
    $("button#submit").val("register")
    $("div#form").removeClass("d-none")
    $("div#form").fadeIn()
}

function showActionButtons() {
    // hide form
    $("div#form").fadeOut()
    // show buttons
    $("div#buttons").fadeIn()
}

function submit(type) {
    var error = (jqXHR, textStatus, errorThrown) => {
        $("small#action-result").text(jqXHR.status + ": " + jqXHR.statusText)
        $("button#loading").addClass("d-none")
        $("button#submit").removeClass("d-none")
    }
    var success = (data) => {
        $("button#loading").addClass("d-none")
        $("button#submit").removeClass("d-none").text("Success")
        if (type == "login") {
            ipcRenderer.send("load-page", "editor")
        }
    }

    $("button#submit").addClass("d-none")
    $("button#loading").removeClass("d-none")
    var url = remote.getGlobal("apiBase")
    var data = { email: $("input#email").val(), password: $("input#password").val() }

    if (type === "login") {
        ipcRenderer.sendSync("alert", "login"+url)
        url = url + "/login"
    } else {
        ipcRenderer.sendSync("alert", "register"+url)
        url = url + "/register"
    }

    $.ajax({
        url: url,
        type: "post",
        data: data,
        error: error,
        success: success
    })
}

let actionButtons = document.getElementById("action-buttons")
let formButtons = document.getElementById("form-buttons")

actionButtons.addEventListener("click", (event) => {
    var target = event.target
    ipcRenderer.sendSync("alert", "id:"+target.id)
    switch (target.id) {
        case "show-login":
            showLoginForm()
            break
        case "show-register":
            showRegisterForm()
            break

    }
})

formButtons.addEventListener("click", (event) => {
    var target = event.target
    ipcRenderer.sendSync("alert", "id:"+target.id)
    switch (target.id) {
        case "return":
            showActionButtons()
            break
        case "submit":
            submit(target.value)
            break
    }
})
