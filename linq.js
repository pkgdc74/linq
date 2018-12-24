(function (me, name) {
    var StringToken = function (pat) {
        this.lexeme = function () {
            return pat;
        }
        this.match = function (s, i) {
            return pat.toLowerCase() == s.slice(i, i + pat.length).toLowerCase();
        }
    }
    var RxToken = function (pat) {
        var l = null;
        this.lexeme = function () {
            return l;
        }
        this.match = function (s, i) {
            var p = s.slice(i).match(pat)
            if (p == null)
                return false;
            l = p[0]
            return true;
        }
    }

    var TockenFactory = new function () {
        this.create = function (pat) {
            var type = {}.toString.call(pat)
            if (type == "[object RegExp]") {
                return new RxToken(pat)
            } else if (type == "[object String]" && pat.startsWith("'") == true) {
                return new StringToken(pat.replace(/'/g, ""))
            } else {
                return new WordToken(pat)
            }
        }
    }

    var Scanner = function (tokens, input) {
        var i = 0, keys = [], ct = null, ti = 0;
        this.advance = function () {
            var rx = /[\s\t\n\r]/;
            while (rx.test(input.charAt(i))) i++;
            for (var x = 0; x < tokens.length; x++)
                if (tokens[x].match(input, i)) {
                    ct = tokens[x]
                    i += ct.lexeme().length;
                    return
                }
        }
        this.state = function () {
            return { index: i, ct: ct, lexeme: ct.lexeme(), input: input }
        }
        this.match = function (t) {
            return ct == t;
        }
        this.matchAdvance = function (t) {
            var x = null;
            if (this.match(t)) {
                x = ct.lexeme()
                this.advance()
            }
            return x
        }
        this.required = function (t) {
            if (this.match(t) == false)
                throw Error("syntax error")
            var lex = ct.lexeme();
            this.advance()
            return lex;
        }
    }

    var STAR = TockenFactory.create("'*'"),
        DOT = TockenFactory.create("'.'"),
        COMMA = TockenFactory.create("','"),
        LP = TockenFactory.create("'('"),
        RP = TockenFactory.create("')'"),
        IS = TockenFactory.create("'IS'"),
        OR = TockenFactory.create("'OR'"),
        NOT = TockenFactory.create("'NOT'"),
        AND = TockenFactory.create("'AND'"),
        FROM = TockenFactory.create("'FROM'"),
        NULL = TockenFactory.create("'NULL'"),
        LIKE = TockenFactory.create("'LIKE'"),
        WHERE = TockenFactory.create("'WHERE'"),
        SELECT = TockenFactory.create("'SELECT'"),
        RELOP = TockenFactory.create(/^=|^>=|^<=|^<>|^>|^</),
        IDENTIFIER = TockenFactory.create(/^[a-zA-Z_][a-zA-Z0-9_]*/),
        DATE = TockenFactory.create(/^'\d{1,2}\/\d{1,2}\/\d{4}'|^'\d{4}-\d{1,2}-\d{1,2}'/),
        STRING = TockenFactory.create(/^'.*?'/),
        BOOLEAN = TockenFactory.create(/^true|^false/),
        NUMERIC = TockenFactory.create(/^\d*\.?\d+/),
        MATHOP = TockenFactory.create(/^[*+-/]/),
        tokens = [STAR, DOT, COMMA, LP, RP, IS, OR, NOT, AND, FROM, NULL, LIKE, WHERE, SELECT, MATHOP, RELOP,
            BOOLEAN, DATE, STRING, NUMERIC, IDENTIFIER]

    var idlist = function () {
        var lex = scanner.matchAdvance(STAR), fields = [];
        if (lex == "*")
            return null;
        while (true) {
            fields.push(lex = scanner.required(IDENTIFIER))
            if (scanner.matchAdvance(COMMA) == null)
                break;
        }
        return fields;
    }

    var expr = function () {
        var left = andExpr()
        while (scanner.matchAdvance(OR) != null) {
            left = new LogicalExpression(left, andExpr(), "OR")
        }
        return left;
    }
    var andExpr = function () {
        var left = relExpr()
        while (scanner.matchAdvance(AND) != null) {
            left = new LogicalExpression(left, relExpr(), "AND")
        }
        return left;
    }
    var relExpr = function () {
        var left = mathExpr()
        while (true) {
            if (scanner.matchAdvance(RELOP) != null) 
                left = new RlationalExpression(left, mathExpr(), RELOP.lexeme())
            else if (scanner.matchAdvance(LIKE) != null) 
                left = new LikeExpression(left, mathExpr())
            else
                break;
        }
        return left;
    }
    var mathExpr = function () {
        var left = term()
        while (scanner.matchAdvance(MATHOP)) {
            left = new MathExpression(left, term(), MATHOP.lexeme())
        }
        return left;
    }
    var term = function () {
        if (scanner.matchAdvance(NOT) != null) {
            return new NotExpression(expr());
        } else if (scanner.matchAdvance(LP) != null) {
            var ex = expr();
            scanner.required(RP);
            return ex;
        } else {
            return factor();
        }
    }
    var factor = function () {
        var result;
        if ((result = scanner.matchAdvance(STRING)) != null) {
            return new AtomicExpression(result.slice(1, -1))
        } else if ((result = scanner.matchAdvance(NUMERIC)) != null) {
            return new AtomicExpression(Number(result))
        } else if ((result = scanner.matchAdvance(BOOLEAN)) != null) {
            return new AtomicExpression(result == "true" ? true : false)
        } else if (scanner.matchAdvance(NULL) != null) {
            return new AtomicExpression(null)
        } else if ((result = scanner.matchAdvance(DATE)) != null) {
            return new AtomicExpression(new Date(result.slice(1, -1)))
        } else {
            var c = scanner.required(IDENTIFIER), t
            if (scanner.matchAdvance(DOT) != null) {
                c = scanner.required(IDENTIFIER)
                t = c;
            }
            return new AtomicExpression(null, t, c)
        }
    }
    var NotExpression = function (exp) {
        this.evaluate = function (tables) {
            var x=exp.evaluate(tables)
            return !exp.evaluate(tables)
        }
    }
    var MathExpression = function (left, right, op) {
        this.evaluate = function (tables) {
            var l = left.evaluate(tables)
            var r = right.evaluate(tables)
            if (op == "+") {
                return l + r;
            }
            if (op == "-") {
                return l - r;
            }
            if (op == "*") {
                return l * r;
            }
            if (op == "/") {
                return l / r;
            }
        }
    }
    var LogicalExpression = function (left, right, op) {
        this.type = "logical"
        this.evaluate = function (tables) {
            var l = left.evaluate(tables)
            var r = right.evaluate(tables)
            if (op == "AND") {
                return l && r;
            }
            if (op == "OR") {
                return l || r;
            }
        }
    }
    var RlationalExpression = function (left, right, op) {
        this.type = "relational"
        this.evaluate = function (tables) {
            var l = left.evaluate(tables)
            var r = right.evaluate(tables)
            if (op == "=") {
                if ({}.toString.call(l) == "[object Date]")
                    return l.getTime() == r.getTime()
                else if ({}.toString.call(l) == "[object String]")
                    return l.toLowerCase() == r.toLowerCase()
                else
                    return l == r;
            }
            if (op == ">=") {
                return l >= r;
            }
            if (op == "<=") {
                return l <= r;
            }
            if (op == ">") {
                return l > r;
            }
            if (op == "<") {
                return l < r;
            }
            if (op == "<>") {
                return l !== r;
            }
        }
    }
    var LikeExpression = function (left, right) {
        this.type = "relational"
        this.evaluate = function (tables) {
            var l = left.evaluate(tables)
            var r = right.evaluate(tables)
            var rx=new RegExp(r)
            return rx.test(l)
        }
    }
    var AtomicExpression = function (v, t, c) {
        this.evaluate = function (tables) {
            if ({}.toString.call(c) != "[object Undefined]") {
                v = tables[c]
            }
            return v
        }
    }
    me[name || "linq"] = new function () {
        var select = function (scanner, data) {
            var fields = idlist();
            scanner.required(FROM);
            var tables = idlist().join(",");
            if (scanner.matchAdvance(WHERE) != null) {
                var etree = expr()
                data = data.filter(function (x) {
                    return etree.evaluate(x)
                })
            }
            if (fields == null)
                return data
            return data.map(function (x) {
                var o = {}
                for (var i = 0; i < fields.length; i++)
                    o[fields[i]] = x[fields[i]]
                return o
            })
        }
        this.execute = function (sql, data) {
            scanner = new Scanner(tokens, sql)
            scanner.advance()
            if (scanner.matchAdvance(SELECT)) {
                return select(scanner, data)
            }
        }
    }
}(this))
