// Utility functions for manipulating maps

var App = global.App || { };

// getItem - Return an item from the map, or null if the item wasn't found. If createFn is a function that returns an object, a new item is created instead.
function getItem (map, key, createFn) {
	var item;

	item = map[key];
	if (item == null) {
		if (typeof createFn == 'function') {
			item = createFn ();
			map[key] = item;
		}
	}

	return (item);
}
exports.getItem = getItem;

// getItemList - Return a list containing all items in the map
function getItemList (map) {
	var list, i;

	list = [ ];
	for (i in map) {
		list.push (map[i]);
	}

	return (list);
}
exports.getItemList = getItemList;
