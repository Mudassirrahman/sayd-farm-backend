const multer = require("multer")

// multer configuration
const storage = multer.memoryStorage()

const upload = multer({ storage })

module.exports = upload