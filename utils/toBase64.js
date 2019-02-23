const fs = require('fs');

module.exports = function (array) {
        let fileInfo = [];

        for(let i = 0; i < array.length; i++) {
            fileInfo.push({
                "key": `assets/${array[i].name}`,
                "attachment": new Buffer(fs.readFileSync(array[i].path)).toString("base64")
            });
            fs.unlinkSync(array[i].path);
        }
        return fileInfo;
    }
