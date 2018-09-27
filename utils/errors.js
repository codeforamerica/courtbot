/* Allows distingushing different kinds of errors */

class HTTPError extends Error{
}

module.exports = {
    HTTPError: HTTPError
}