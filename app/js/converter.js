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
        this.translatedLatex = '%s'
        let convertedElements = this._convert_elements(html)
        this.translatedLatex = util.format(this.translatedLatex, convertedElements)
        return this.translatedLatex
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

    _convert_headings(headingValue, elementContent) {
        let headingLatex = this.headings[headingValue]
        var parsedInnerLatex = ''
        if (!headingLatex) {
            console.log('warn: unsupported heaing: h1')
            parsedInnerLatex = `${elementContent}\n`
        } else {
            parsedInnerLatex = `\\${headingLatex}{${elementContent}}\n`
        }
        return parsedInnerLatex
    }

    _convert_elements(html) {
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
            if (element.textContent == '' && tagName != 'IMG' && !outerHTML.includes('<img')) {
                console.log('ignore:', tagName)
                latex = latex.replace(outerHTML, "")
                continue
            }

            switch (tagName) {
                // Converting Heading
                case 'H1':
                    parsedInnerLatex = this._convert_headings(0, elementContent)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H2':
                    parsedInnerLatex = this._convert_headings(1, elementContent)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H3':
                    parsedInnerLatex = this._convert_headings(2, elementContent)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H4':
                    parsedInnerLatex = this._convert_headings(3, elementContent)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H5':
                    parsedInnerLatex = this._convert_headings(4, elementContent)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H6':
                    parsedInnerLatex = this._convert_headings(5, elementContent)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                // Converting references
                case 'REFERENCE':
                    if (element.children[0] && element.children[0].tagName == 'SUP') {
                        parsedInnerLatex = `\\supercite{${element.getAttribute('labels')}}`
                    } else {
                        parsedInnerLatex = `\\cite{${element.getAttribute('labels')}}`
                    }
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                // Converting images
                case 'IMG':
                    var imgID = element.getAttribute('id')
                    var imgType = element.getAttribute('format')
                    parsedInnerLatex = '\\begin{figure}[hbt]\n'
                                        + '\\centering\n'
                                        + `\\includegraphics[width=0.7\\linewidth]{${imgID}.${imgType}}\n`
                                        + '\\end{figure}'
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                // Converting others
                case 'DIV':
                    parsedInnerLatex = `\n${this._convert_elements(element.innerHTML)}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    // latex += this._convert_elements(element.innerHTML) + '\n'
                    break
                case 'P':
                    parsedInnerLatex = `\n${this._convert_elements(element.innerHTML)}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'SPAN':
                    parsedInnerLatex = `${this._convert_elements(element.innerHTML)}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'B':
                    parsedInnerLatex = `\\textbf{${this._convert_elements(element.innerHTML)}}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'I':
                    parsedInnerLatex = `\\emph{${this._convert_elements(element.innerHTML)}}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'U':
                    parsedInnerLatex = `\\underline{${this._convert_elements(element.innerHTML)}}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'UL':
                    parsedInnerLatex = `\\begin{itemize}\n${this._convert_elements(element.innerHTML)}\n\\end{itemize}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'OL':
                    parsedInnerLatex = `\\begin{enumerate}\n${this._convert_elements(element.innerHTML)}\n\\end{enumerate}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'LI':
                    parsedInnerLatex = `\\item ${this._convert_elements(element.innerHTML)}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
            }
        }
        return latex
    }
}

module.exports.Converter = Converter