
const { ObjectId } = require('mongodb');

const objectIdValidator = (mongoId, helpers) => {
    if (!ObjectId.isValid(mongoId)) {
        return helpers.error('any.invalid');
    }
    return mongoId;
};

const parseBoolean = (value) => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
    }
    return false;
}

const kbToBytes = kb => {
    if (isNaN(kb)) {
        return "Invalid input";
    }
    return `${kb * 1024}`;
};

const bytesToKB = bytes => {
    if (isNaN(bytes)) {
        return "Invalid input";
    }
    return `${bytes / 1024}`;
};

const secondsToMilliseconds = seconds => {
    if (isNaN(seconds)) {
        return "Invalid input";
    }
    return `${seconds * 1000}`;
};

const millisecondsToSeconds = milliseconds => {
    if (isNaN(milliseconds)) {
        return "Invalid input";
    }
    return `${(milliseconds / 1000)}`;
};

const minutesToMilliseconds = minutes => {
    if (isNaN(minutes)) {
        return "Invalid input";
    }
    return `${minutes * 60 * 1000}`;
};

const millisecondsToMinutes = milliseconds => {
    if (isNaN(milliseconds)) {
        return "Invalid input";
    }
    return `${(milliseconds / (60 * 1000))}`;
};
function generateReqNumber() {
    const prefix = "CYB";
    const uniqueNumber = Date.now().toString();
    return `${prefix}${uniqueNumber}`;
}


function getChangedFields(previousRecord, updatedRecord) {
    const changes = {};
    const ignoredFields = new Set(["_id", "commandGroupsRef", "serverGroupsRef", "isDeleted", "updatedBy", "updatedAt", "createdBy", "createdAt", "username"]);

    for (const key of Object.keys(updatedRecord)) {
        if (ignoredFields.has(key)) {
            continue;
        }

        const prevValue = previousRecord?.[key];
        const updatedValue = updatedRecord?.[key];

        if (Array.isArray(prevValue) && Array.isArray(updatedValue)) {
            if (!areArraysEqual(prevValue, updatedValue)) {
                changes[key] = {
                    previous: prevValue,
                    updated: updatedValue,
                };
            }
        } else if (isObject(prevValue) && isObject(updatedValue)) {
            if (!areObjectsEqual(prevValue, updatedValue)) {
                changes[key] = {
                    previous: prevValue,
                    updated: updatedValue,
                };
            }
        } else if (prevValue !== updatedValue) {
            changes[key] = {
                previous: prevValue,
                updated: updatedValue,
            };
        }
    }

    return changes;
}

function areArraysEqual(arr1, arr2) {
    return JSON.stringify(arr1) === JSON.stringify(arr2);
}

function areObjectsEqual(obj1, obj2) {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
}

function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
    millisecondsToMinutes,
    minutesToMilliseconds,
    millisecondsToSeconds,
    secondsToMilliseconds,
    bytesToKB,
    kbToBytes,
    parseBoolean,
    objectIdValidator,
    generateReqNumber,
    getChangedFields
};
