'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Function to determine the type of a value
function determineType(value) {
	if (Array.isArray(value)) return 'array'; // Handle arrays specifically
	if (value === null) return 'null'; // Handle null specifically
	if (typeof value === 'string' && !isNaN(value.trim())) return 'number'; // String representing a number
	return typeof value; // Standard types (string, number, boolean, etc.)
}

class IobrokerWebhook extends utils.Adapter {
	constructor(options) {
		super({
			...options,
			name: 'iobroker-webhook'
		});

		// Register events
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));

		// Optional: Additional events you want to use
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));

		this.server = null; // Initialize the server
	}

	// Called when the adapter is ready
	async onReady() {
		this.log.info('Adapter is ready!');

		const port = this.config.port || 8095; // Port from configuration or default port
		this.log.info(`Starting webhook server on port ${port}`);

		const express = require('express');
		const bodyParser = require('body-parser');
		const cors = require('cors');

		const app = express();
		app.use(cors()); // Enable CORS
		app.use(bodyParser.json()); // Enable JSON body parser

		// Handle all incoming requests
		app.all('*', async (req, res) => {
			const urlParts = req.path
				.split('/')
				.filter((part) => ('' + part).trim() !== '')
				.filter(Boolean);
			const folderPath = urlParts.slice(0, -1).join('.'); // Directory up to the last segment
			const lastPart = urlParts[urlParts.length - 1]; // Last segment

			// If `folderPath` is empty, use only `lastPart`
			const basePath = folderPath ? `${folderPath}.${lastPart}` : lastPart;

			// Paths for meta and data states
			const metaParentPath = `${basePath}.meta`;
			const dataParentPath = `${basePath}.data`;

			const meta = {
				ip: req.ip, // IP address of the requester
				method: req.method, // HTTP method
				timestamp: new Date().toISOString() // Timestamp of the request
			};

			// Data from the request body for POST or query parameters for GET
			const data = req.method === 'POST' ? req.body : req.query;

			// Function to recursively process and store data
			const processJson = async (data, parentPath) => {
				for (const key in data) {
					if (data.hasOwnProperty(key)) {
						const value = data[key];
						const currentPath = `${parentPath}.${key}`;

						if (typeof value === 'object' && value !== null) {
							// If it's another object, process recursively
							await processJson(value, currentPath);
						} else {
							// If it's a primitive value, create a state
							await this.setObjectNotExistsAsync(currentPath, {
								type: 'state',
								common: {
									name: key,
									role: 'state',
									type: determineType(value), // Determine the type of the value
									read: true,
									write: true
								},
								native: {}
							});

							// Set the state value
							await this.setStateAsync(currentPath, { val: value, ack: true });
						}
					}
				}
			};

			// Process meta and data
			await processJson(meta, metaParentPath); // Recursively store meta data
			await processJson(data, dataParentPath); // Recursively store data

			// Send response
			res.setHeader('Content-Type', 'application/json');
			res.status(200).json({ status: 'success' });
		});

		try {
			this.server = app.listen(port, () => {
				this.log.info(`Webhook server running on port ${port}`);
			});
		} catch (error) {
			this.log.error(`Error starting the server: ${error.message}`);
		}
	}

	// Handle 'stateChange' event
	onStateChange(id, state) {
		this.log.debug(`State change detected: ${id}`);
	}

	// Called when the adapter is unloaded
	async onUnload(callback) {
		try {
			if (this.server) {
				await this.server.close(); // Stop the server
				this.log.info('Webhook server stopped.');
			}
			callback();
		} catch (e) {
			this.log.error(`Error while stopping the server: ${e.message}`);
			callback(e);
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new IobrokerWebhook(options);
} else {
	// otherwise start the instance directly
	new IobrokerWebhook();
}
