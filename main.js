'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Load your modules here, e.g.:
// const fs = require("fs");

class IobrokerWebhook extends utils.Adapter {
	constructor(options) {
		super({
			...options,
			name: 'iobroker-webhook'
		});
		this.server = null;
	}

	async onReady() {
		const port = this.config.port || 8080;

		const app = express();
		app.use(cors()); // CORS aktivieren
		app.use(bodyParser.json());

		app.all('*', async (req, res) => {
			const urlParts = req.path.split('/').filter(Boolean);
			const folderPath = urlParts.slice(0, -1).join('.');
			const lastPart = urlParts[urlParts.length - 1];

			const meta = {
				ip: req.ip,
				method: req.method,
				timestamp: new Date().toISOString()
			};

			const data = req.body;

			const metaPath = `${folderPath}.${lastPart}.meta`;
			const dataPath = `${folderPath}.${lastPart}.data`;

			await this.setObjectNotExistsAsync(metaPath, {
				type: 'state',
				common: {
					name: 'Meta information for ' + lastPart,
					role: 'meta',
					type: 'string',
					read: true,
					write: false
				},
				native: {}
			});

			await this.setObjectNotExistsAsync(dataPath, {
				type: 'state',
				common: {
					name: 'Data for ' + lastPart,
					role: 'data',
					type: 'string',
					read: true,
					write: true
				},
				native: {}
			});

			await this.setStateAsync(metaPath, { val: JSON.stringify(meta), ack: true });
			await this.setStateAsync(dataPath, { val: JSON.stringify(data), ack: true });

			res.send('OK');
		});

		this.server = app.listen(port, () => {
			this.log.info(`Webhook server running on port ${port}`);
		});
	}

	onUnload(callback) {
		try {
			if (this.server) {
				this.server.close();
			}
			callback();
		} catch (e) {
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
