const util = require('util')

class Converter {

    constructor(headings) {
        this.translatedLatex = '%s'
        this.headings = {}
        if (headings.length == 0) {
            headings = ['section', 'subsection', 'subsubsection']
        }
        this.headings = headings
    }

    convert(html) {
        html = this._decode_html_space(html)
        this.translatedLatex = '%s'
        let convertedElements = this._convert_elements(html)
        this.translatedLatex = util.format(this.translatedLatex, convertedElements)
        return this.translatedLatex
    }

    _decode_html_space(html) {
        return html.replace(/&nbsp;/g, ' ')
    }

    _getDOM(html) {
        return new DOMParser().parseFromString(html, 'text/html')
    }

    _getParsedDomBodyElements(parsedDom) {
        return parsedDom.children[0].children[1].children
    }

    _into_one_line(str) {
        return str.split('\n').join('')
    }

    _convert_headings(headingValue, elementContent, element) {
        let headingLatex = this.headings[headingValue]
        var parsedInnerLatex = ''
        if (!headingLatex) {
            console.log('warn: unsupported heaing: h1')
            parsedInnerLatex = `${elementContent}\n`
        } else {
            const headingID = element.id
            if (headingID) {
                parsedInnerLatex = `\\${headingLatex}{${elementContent}} \\label{${headingID}}\n`
            } else {
                parsedInnerLatex = `\\${headingLatex}{${elementContent}}\n`
            }
        }
        return parsedInnerLatex
    }

    _convert_elements(html, parentNode = '') {
        var htmlDom = this._getDOM(html)
        var bodyDom = this._getParsedDomBodyElements(htmlDom)
        if (bodyDom.length == 0) {
            // html is pure text
            return html
        }
        var latex = this._into_one_line(html)
        var parsedInnerLatex = ''
        for (let i = 0; i < bodyDom.length; i++) {
            let element = bodyDom[i]
            let elementContent = this._into_one_line(element.textContent)
            let outerHTML = this._into_one_line(element.outerHTML)
            let tagName = element.tagName
            if (element.textContent == '' && tagName != 'IMG' && !outerHTML.includes('<img')
                && tagName != 'EQUATION' && !outerHTML.includes('<equation')
                && tagName != 'REFERENCE' && !outerHTML.includes('<reference')) {
                console.log('ignore:', tagName)
                latex = latex.replace(outerHTML, "")
                continue
            }
            switch (tagName) {
                // Converting Heading
                case 'H1':
                    parsedInnerLatex = this._convert_headings(0, elementContent, element)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H2':
                    parsedInnerLatex = this._convert_headings(1, elementContent, element)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H3':
                    parsedInnerLatex = this._convert_headings(2, elementContent, element)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H4':
                    parsedInnerLatex = this._convert_headings(3, elementContent, element)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H5':
                    parsedInnerLatex = this._convert_headings(4, elementContent, element)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H6':
                    parsedInnerLatex = this._convert_headings(5, elementContent, element)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                // Converting references
                case 'REFERENCE':
                    var referenceLabel = element.getAttribute('labels')
                    if (element.getAttribute('type') === 'cite') {
                        if (element.getAttribute('sup')) {
                            parsedInnerLatex = `\\supercite{${referenceLabel}}`
                        } else {
                            parsedInnerLatex = `\\cite{${referenceLabel}}`
                        }
                    } else if (element.getAttribute('type') === 'label') {
                        var refType = element.getAttribute('ref-type'), refCommand
                        if (refType === 'element') refCommand = '\\ref'
                        else if (refType === 'page') refCommand = '\\pageref'
                        // the end whitespace is needed
                        parsedInnerLatex = `${refCommand}{${referenceLabel}}`
                    }
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                // Converting images
                case 'IMG':
                    var imgID = element.getAttribute('id')
                    var imgType = element.getAttribute('format')
                    var caption = element.getAttribute('caption')
                    var linewidth = element.getAttribute('linewidth')
                    if (parentNode == 'TABLE') {
                        // images inside tables
                        parsedInnerLatex = `\\includegraphics[width=${linewidth}\\linewidth]{${imgID}.${imgType}}\n`
                    } else {
                        parsedInnerLatex = '\\begin{figure}[hbt]\n'
                            + '\\centering\n'
                            + `\\includegraphics[width=${linewidth}\\linewidth]{${imgID}.${imgType}}\n`
                        if (caption) {
                            parsedInnerLatex += `\\caption{${caption}}\n`
                        }
                        parsedInnerLatex += `\\label{${imgID}}\n`
                        parsedInnerLatex += '\\end{figure}'
                    }
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'IMGSIZEHINT':
                    latex = latex.replace(outerHTML, '')
                    break
                // Converting tables
                case 'TABLE':
                    var frameStyle = element.getAttribute('frame')
                    var rulesStyle = element.getAttribute('rules')
                    var topLine, bottomLine, leftLine, rightLine, rowLine, colLine
                    // parse frame style: only support `box` and `hsides`
                    if (frameStyle == 'box') {
                        topLine = bottomLine = rightLine = leftLine = true
                    } else if (frameStyle == 'hsides') {
                        topLine = bottomLine = true
                        rightLine = leftLine = false
                    }
                    // parse rules style: only support `all`
                    if (rulesStyle == 'all') {
                        rowLine = colLine = true
                    }
                    // row format in LaTeX
                    var colNumber = parseInt(element.getAttribute('col'))
                    var rowFormat = Array(colNumber).fill('c')
                    if (colLine) rowFormat = rowFormat.join('|')
                    else rowFormat = rowFormat.join('')
                    if (leftLine) rowFormat = '|' + rowFormat
                    if (rightLine) rowFormat = rowFormat + '|'
                    // convert the table
                    var tableCaption = element.getAttribute('caption')
                    var tbodyRE = /<tbody>(.*?)<\/tbody>/gs
                    var trRE = /<tr>(.*?)<\/tr>/gs
                    var thRE = /<th>(.*?)<\/th>/gs
                    var tdRE = /<td>(.*?)<\/td>/gs
                    var parsedTBody = this._into_one_line(element.innerHTML).replace(tbodyRE, '$1')
                    var parsedRows = []
                    while (true) {
                        let result = trRE.exec(parsedTBody)
                        if (!result) break
                        let row = result[1]
                        let parsedRow = []
                        while (true) {
                            let result = thRE.exec(row)
                            if (!result) break
                            let content = this._convert_elements(result[1], 'TABLE')
                            parsedRow.push(`\\textbf{${content}}`)
                        }
                        while (true) {
                            let result = tdRE.exec(row)
                            if (!result) break
                            let content = this._convert_elements(result[1], 'TABLE')
                            parsedRow.push(`${content}`)
                        }
                        parsedRow = parsedRow.join('& ')
                        parsedRows.push(parsedRow + '\\\\\n')
                    }
                    if (rowLine) parsedRows = parsedRows.join('\\hline\n')
                    else parsedRows = parsedRows.join('')
                    if (topLine) parsedRows = '\\hline\n' + parsedRows
                    if (bottomLine) parsedRows = parsedRows + '\\hline\n'
                    parsedInnerLatex = '\\begin{table}[hbt]\n' + '\\centering'
                    if (tableCaption) parsedInnerLatex += `\\caption{${tableCaption}}\n`
                    parsedInnerLatex += `\\begin{tabular}{${rowFormat}}\n`
                        + parsedRows
                        + '\\end{tabular}\n'
                        + `\\label{${element.id}}\n`
                        + '\\end{table}'
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                // Converting equations
                case 'EQUATION':
                    var equationStyle = element.getAttribute('eq-style')
                    var equationLatex = element.getAttribute('latex')
                    if (equationStyle === 'inline') {
                        parsedInnerLatex = `\$${equationLatex}\$`
                    } else if (equationStyle === 'display-numbered') {
                        parsedInnerLatex = '\n\\begin{equation}\n'
                            + equationLatex + '\n'
                            + `\\label{${element.id}}\n`
                            + '\\end{equation}\n'
                    } else if (equationStyle === 'display-unnumbered') {
                        parsedInnerLatex = '\n\\begin{displaymath}\n'
                            + equationLatex + '\n'
                            + '\\end{displaymath}\n'
                    } else {
                        console.log('unknown equation style: ', equationStyle)
                        parsedInnerLatex = ''
                    }
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'EQUATION-EXTRA':
                    latex = latex.replace(outerHTML, '')
                    break
                // Converting quotes
                case 'QUOTE':
                    var quoteStyle = element.getAttribute('qt-style')
                    if (quoteStyle === 'quote') {
                        parsedInnerLatex = '\n\\begin{quote}\n'
                            + `${this._convert_elements(element.innerHTML)}\n`
                            + '\\end{quote}\n'
                    } else if (quoteStyle === 'quotation') {
                        parsedInnerLatex = '\n\\begin{quotation}\n'
                            + `${this._convert_elements(element.innerHTML)}\n`
                            + '\\end{quotation}\n'
                    } else {
                        parsedInnerLatex = '\n\\begin{verse}\n'
                            + `${this._convert_elements(element.innerHTML)}\n`
                            + '\\end{verse}\n'
                    }
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'QUOTE-EXTRA':
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                // Converting others
                case 'DIV':
                    parsedInnerLatex = `\n\n${this._convert_elements(element.innerHTML, parentNode)}\n\n`
                    parsedInnerLatex = this._convert_elements(element.innerHTML, parentNode)
                    var align = element.style.textAlign
                    // NOTE: align style of texts in table columns and rows, equations and images have no effect
                    if (align === 'center') {
                        // TODO: center environment ouside centering image will cause large space after image
                        if (parsedInnerLatex.indexOf('\\centering') < 0)
                            parsedInnerLatex = `\n\n\\begin{center}\n${parsedInnerLatex}\n\\end{center}\n\n`
                    } else if (align === 'right') {
                        parsedInnerLatex = `\n\n\\begin{flushright}\n${parsedInnerLatex}\n\\end{flushright}\n\n`
                    } else if (align === 'left') {
                        parsedInnerLatex = `\n\n\\begin{flushleft}\n${parsedInnerLatex}\n\\end{flushleft}\n\n`
                    } else {
                        parsedInnerLatex = `\n\n${parsedInnerLatex}\n\n`
                    }
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    // latex += this._convert_elements(element.innerHTML) + '\n'
                    break
                case 'P':
                    parsedInnerLatex = `\n${this._convert_elements(element.innerHTML, parentNode)}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'SPAN':
                    parsedInnerLatex = `${this._convert_elements(element.innerHTML, parentNode)}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'B':
                    parsedInnerLatex = `\\textbf{${this._convert_elements(element.innerHTML, parentNode)}}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'I':
                    parsedInnerLatex = `\\emph{${this._convert_elements(element.innerHTML, parentNode)}}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'U':
                    parsedInnerLatex = `\\underline{${this._convert_elements(element.innerHTML, parentNode)}}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'UL':
                    parsedInnerLatex = `\\begin{itemize}\n${this._convert_elements(element.innerHTML, parentNode)}\n\\end{itemize}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'OL':
                    parsedInnerLatex = `\\begin{enumerate}\n${this._convert_elements(element.innerHTML, parentNode)}\n\\end{enumerate}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'LI':
                    parsedInnerLatex = `\\item ${this._convert_elements(element.innerHTML, parentNode)}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
            }
        }
        return latex
    }
}

module.exports.Converter = Converter