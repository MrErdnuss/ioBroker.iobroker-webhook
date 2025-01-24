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

class IobrokerWebhook extends utils.Adapter {
	constructor(options) {
		super({
			...options,
			name: 'iobroker-webhook'
		});

		// Registrierung der Events
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));

		// Optional: Weitere Events, die du verwenden möchtest
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));

		this.server = null;

		// Logging um sicherzustellen, dass der Konstruktor korrekt aufgerufen wird
		this.log.debug('Adapter-Konstruktor wird aufgerufen!');
	}

	async onReady() {
		this.log.info('Adapter ist bereit!');

		const port = this.config.port || 8090;
		this.log.info(`Starte Webhook-Server auf Port ${port}`);

		const express = require('express');
		const bodyParser = require('body-parser');
		const cors = require('cors');

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

	// Handle 'stateChange' event
	onStateChange(id, state) {
		this.log.debug(`State change detected: ${id}`);
	}

	onUnload(callback) {
		try {
			if (this.server) {
				this.server.close(() => {
					this.log.info('Webhook server stopped.');
					callback();
				});
			} else {
				callback();
			}
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
