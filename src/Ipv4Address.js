// Class that handles manipulation of IPv4 addresses

class Ipv4Address {
	constructor (address) {
		this.isValid = false;
		this.octets = [ ];
		this.netmaskOctets = [ ];

		this.parse (address);
	}

	// Return a string representation of the address, or an empty string if the address has not parsed a valid source value
	toString () {
		if (! this.isValid) {
			return ("");
		}
		return (this.octets.join ("."));
	}

	// Parse the provided address string and store the resulting values
	parse (address) {
		let match, i, num;

		this.isValid = false;
		if (typeof address != "string") {
			return;
		}
		match = address.match (/^([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)$/);
		if (match == null) {
			return;
		}
		this.octets = [ ];
		for (i = 1; i < 5; ++i) {
			num = parseInt (match[i], 10);
			if (isNaN (num)) {
				return;
			}
			if ((num < 0) || (num > 255)) {
				return;
			}
			this.octets.push (num);
		}

		this.netmaskOctets = [ ];
		this.isValid = true;
	}

	// Set the netmask value associated with the address
	setNetmask (netmask) {
		let match, i, num;

		if (typeof netmask != "string") {
			return;
		}
		match = netmask.match (/^([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)$/);
		if (match == null) {
			return;
		}
		this.netmaskOctets = [ ];
		for (i = 1; i < 5; ++i) {
			num = parseInt (match[i], 10);
			if (isNaN (num)) {
				return;
			}
			if ((num < 0) || (num > 255)) {
				return;
			}
			this.netmaskOctets.push (num);
		}
	}

	// Return a string containing the object's broadcast address, as composed from previously provided address and netmask values, or an empty string if the broadcast address could not be determined
	getBroadcastAddress () {
		let i, addr, num, inverse;

		if ((! this.isValid) || (this.netmaskOctets.length != 4)) {
			return ("");
		}

		addr = [ ];
		for (i = 0; i < 4; ++i) {
			num = this.octets[i];
			num &= this.netmaskOctets[i];
			inverse = ~(this.netmaskOctets[i]);
			inverse &= 0xFF;
			inverse >>>= 0;
			num |= inverse;
			num >>>= 0;
			addr.push (num);
		}

		return (addr.join ("."));
	}

	// Return a boolean value indicating if the address has parsed successfully and holds a localhost value
	isLocalhost () {
		if (! this.isValid) {
			return (false);
		}

		if ((this.octets[0] == 127) && (this.octets[1] == 0) && (this.octets[2] == 0) && (this.octets[3] == 1)) {
			return (true);
		}

		return (false);
	}
}

module.exports = Ipv4Address;
