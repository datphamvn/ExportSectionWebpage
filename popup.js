var sourceCode, xPath;

chrome.extension.onMessage.addListener(function (message, messageSender, sendResponse) {
    // message is the message you sent, probably an object
    // messageSender is an object that contains info about the context that sent the message
    // sendResponse is a function to run when you have a response
    sourceCode = message;
});

document.getElementById('target').addEventListener('click', function () {
    chrome.runtime.getBackgroundPage(function (backgroundPage) {
        chrome.tabs.query({ active: true, currentWindow: true }, tab => {
            backgroundPage.toggle(tab[0]);
        });
    })
});

document.getElementById('export').addEventListener('click', function () {
    xPath = document.getElementById('xPath').value;
    var codeExport = exportCode(sourceCode, xPath);
    exportFile(generateFileName() + ".html", codeExport);
});

function exportCode(sourceCode, xPath) {
    var doc = new DOMParser().parseFromString(sourceCode, "text/html");
    //Remove Elements of Xpath
    try {
        doc.getElementById("xpath-css").remove();
        doc.getElementById("xpath-content").remove();
        doc.getElementById("xpath-overlay").remove();
    }
    catch (err) { }

    // Add CSS display:none
    const style = doc.createElement('style');
    style.textContent = createCSSFromXPath(xPath);
    doc.head.appendChild(style);

    return doc.documentElement.outerHTML;
}

function createCSSFromXPath(xPath) {
    let strSelector = cssify(xPath);
    strSelector = strSelector.replace(/\s+/g, '');
    var arrNode = strSelector.split('>');
    var lstStrSelector = [];

    let temp = arrNode[0];
    for (let i = 0; i < arrNode.length - 1; i++) {
        if (arrNode[i + 1] != "html" && arrNode[i + 1] != "body") {
            let addNotSelector = temp + ">*:not(" + arrNode[i + 1] + ")";
            lstStrSelector.push(addNotSelector);
        }
        temp += ">" + arrNode[i + 1];
    }

    let strCSS = "";
    for (const item of lstStrSelector) {
        strCSS += item + ", ";
    }

    strCSS = strCSS.substring(0, strCSS.length - 2) + " { display: none !important; }";
    return strCSS;
}

function exportFile(filename, content) {
    var pom = document.createElement('a');
    pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    pom.setAttribute('download', filename);
    pom.click();
}

function generateFileName() {
    var m = new Date();
    return m.getUTCFullYear() + (m.getUTCMonth() + 1) + m.getUTCDate() + "_" + m.getUTCHours() + m.getUTCMinutes() + m.getUTCSeconds();
}


// Convert XPath to CSS Selector 
var sub_regexes = {
    "tag": "([a-zA-Z][a-zA-Z0-9]{0,10}|\\*)",
    "attribute": "[.a-zA-Z_:][-\\w:.]*(\\(\\))?)",
    "value": "\\s*[\\w/:][-/\\w\\s,:;.]*"
};

var validation_re =
    "(?P<node>" +
    "(" +
    "^id\\([\"\\']?(?P<idvalue>%(value)s)[\"\\']?\\)" +// special case! `id(idValue)`
    "|" +
    "(?P<nav>//?(?:following-sibling::)?)(?P<tag>%(tag)s)" + //  `//div`
    "(\\[(" +
    "(?P<matched>(?P<mattr>@?%(attribute)s=[\"\\'](?P<mvalue>%(value)s))[\"\\']" + // `[@id="well"]` supported and `[text()="yes"]` is not
    "|" +
    "(?P<contained>contains\\((?P<cattr>@?%(attribute)s,\\s*[\"\\'](?P<cvalue>%(value)s)[\"\\']\\))" +// `[contains(@id, "bleh")]` supported and `[contains(text(), "some")]` is not 
    ")\\])?" +
    "(\\[\\s*(?P<nth>\\d|last\\(\\s*\\))\\s*\\])?" +
    ")" +
    ")";

for (var prop in sub_regexes)
    validation_re = validation_re.replace(new RegExp('%\\(' + prop + '\\)s', 'gi'), sub_regexes[prop]);
validation_re = validation_re.replace(/\?P<node>|\?P<idvalue>|\?P<nav>|\?P<tag>|\?P<matched>|\?P<mattr>|\?P<mvalue>|\?P<contained>|\?P<cattr>|\?P<cvalue>|\?P<nth>/gi, '');

function XPathException(message) {
    this.message = message;
    this.name = "[XPathException]";
}

// var log = window.console.log.bind(console);

function cssify(xpath) {
    var prog, match, result, nav, tag, attr, nth, nodes, css, node_css = '', csses = [], xindex = 0, position = 0;

    // preparse xpath: 
    // `contains(concat(" ", @class, " "), " classname ")` => `@class=classname` => `.classname`
    xpath = xpath.replace(/contains\s*\(\s*concat\(["']\s+["']\s*,\s*@class\s*,\s*["']\s+["']\)\s*,\s*["']\s+([a-zA-Z0-9-_]+)\s+["']\)/gi, '@class="$1"');

    if (typeof xpath == 'undefined' || (
        xpath.replace(/[\s-_=]/g, '') === '' ||
        xpath.length !== xpath.replace(/[-_\w:.]+\(\)\s*=|=\s*[-_\w:.]+\(\)|\sor\s|\sand\s|\[(?:[^\/\]]+[\/\[]\/?.+)+\]|starts-with\(|\[.*last\(\)\s*[-\+<>=].+\]|number\(\)|not\(|count\(|text\(|first\(|normalize-space|[^\/]following-sibling|concat\(|descendant::|parent::|self::|child::|/gi, '').length)) {
        //`number()=` etc or `=normalize-space()` etc, also `a or b` or `a and b` (to fix?) or other unsupported keywords
        throw new XPathException('Invalid or unsupported XPath: ' + xpath);
    }

    var xpatharr = xpath.split('|');
    while (xpatharr[xindex]) {
        prog = new RegExp(validation_re, 'gi');
        css = [];
        // log('working with xpath: ' + xpatharr[xindex]);
        while (nodes = prog.exec(xpatharr[xindex])) {
            if (!nodes && position === 0) {
                throw new XPathException('Invalid or unsupported XPath: ' + xpath);
            }

            // log('node found: ' + JSON.stringify(nodes));
            match = {
                node: nodes[5],
                idvalue: nodes[12] || nodes[3],
                nav: nodes[4],
                tag: nodes[5],
                matched: nodes[7],
                mattr: nodes[10] || nodes[14],
                mvalue: nodes[12] || nodes[16],
                contained: nodes[13],
                cattr: nodes[14],
                cvalue: nodes[16],
                nth: nodes[18]
            };
            // log('broke node down to: ' + JSON.stringify(match));

            if (position != 0 && match['nav']) {
                if (~match['nav'].indexOf('following-sibling::')) nav = ' + ';
                else nav = (match['nav'] == '//') ? ' ' : ' > ';
            } else {
                nav = '';
            }
            tag = (match['tag'] === '*') ? '' : (match['tag'] || '');

            if (match['contained']) {
                if (match['cattr'].indexOf('@') === 0) {
                    attr = '[' + match['cattr'].replace(/^@/, '') + '*=' + match['cvalue'] + ']';
                } else { //if(match['cattr'] === 'text()')
                    throw new XPathException('Invalid or unsupported XPath attribute: ' + match['cattr']);
                }
            } else if (match['matched']) {
                switch (match['mattr']) {
                    case '@id':
                        attr = '#' + match['mvalue'].replace(/^\s+|\s+$/, '').replace(/\s/g, '#');
                        break;
                    case '@class':
                        attr = '.' + match['mvalue'].replace(/^\s+|\s+$/, '').replace(/\s/g, '.');
                        break;
                    case 'text()':
                    case '.':
                        throw new XPathException('Invalid or unsupported XPath attribute: ' + match['mattr']);
                    default:
                        if (match['mattr'].indexOf('@') !== 0) {
                            throw new XPathException('Invalid or unsupported XPath attribute: ' + match['mattr']);
                        }
                        if (match['mvalue'].indexOf(' ') !== -1) {
                            match['mvalue'] = '\"' + match['mvalue'].replace(/^\s+|\s+$/, '') + '\"';
                        }
                        attr = '[' + match['mattr'].replace('@', '') + '=' + match['mvalue'] + ']';
                        break;
                }
            } else if (match['idvalue'])
                attr = '#' + match['idvalue'].replace(/\s/, '#');
            else
                attr = '';

            if (match['nth']) {
                if (match['nth'].indexOf('last') === -1) {
                    if (isNaN(parseInt(match['nth'], 10))) {
                        throw new XPathException('Invalid or unsupported XPath attribute: ' + match['nth']);
                    }
                    nth = parseInt(match['nth'], 10) !== 1 ? ':nth-of-type(' + match['nth'] + ')' : ':first-of-type';
                } else {
                    nth = ':last-of-type';
                }
            } else {
                nth = '';
            }
            node_css = nav + tag + attr + nth;

            // log('final node css: ' + node_css);
            css.push(node_css);
            position++;
        } //while(nodes)

        result = css.join('');
        if (result === '') {
            throw new XPathException('Invalid or unsupported XPath: ' + match['node']);
        }
        csses.push(result);
        xindex++;

    } //while(xpatharr)

    return csses.join(', ');
}