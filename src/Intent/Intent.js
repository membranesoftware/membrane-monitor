// Class that holds intent type data

var App = global.App || { };
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var IntentTypes = require ("./types");

function Intent () {

}

module.exports = Intent;

Intent.IntentTypes = IntentTypes;
exports.IntentTypes = IntentTypes;

// createIntent - Return a newly created intent of the specified type name and configure it with the provided object. Returns null if the intent could not be created, indicating that the type name was not found or the configuration was not valid.
Intent.createIntent = function (typeName, configureParams) {
	let itype, intent;

	itype = Intent.IntentTypes[typeName];
	if (itype == null) {
		return (null);
	}

	intent = new itype ();
	if ((typeof configureParams != "object") || (configureParams == null)) {
		configureParams = { };
	}
	if (intent.configure (configureParams) != Result.SUCCESS) {
		return (null);
	}

	return (intent);
};
