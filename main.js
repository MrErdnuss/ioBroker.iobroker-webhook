'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

function determineType(value) {
	if (Array.isArray(value)) return 'array'; // Arrays speziell behandeln
	if (value === null) return 'null'; // null speziell behandeln
	if (typeof value === 'string' && !isNaN(value.trim())) return 'number'; // String, der eine Zahl darstellt
	return typeof value; // Standard-Typen (string, number, boolean, etc.)
}

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
	}

	async onReady() {
		this.log.info('Adapter ist bereit!');

		const port = this.config.port || 8095;
		this.log.info(`Starte Webhook-Server auf Port ${port}`);

		const express = require('express');
		const bodyParser = require('body-parser');
		const cors = require('cors');

		const app = express();
		app.use(cors()); // CORS aktivieren
		app.use(bodyParser.json());

		app.all('*', async (req, res) => {
			const urlParts = req.path
				.split('/')
				.filter((part) => part && part.trim() !== '') // Leere Teile entfernen
				.filter((part) => part !== 'favicon'); // "favicon" ignorieren

			const folderPath = urlParts.slice(0, -1).join('.');
			const lastPart = urlParts[urlParts.length - 1];

			// Meta-Informationen
			const meta = {
				ip: req.ip,
				method: req.method,
				timestamp: new Date().toISOString()
			};

			// Data-Inhalte (GET-Parameter oder POST-Body)
			const data = req.method === 'GET' ? req.query : req.body;

			// Meta-States als einzelne Einträge anlegen
			for (const [key, value] of Object.entries(meta)) {
				const metaKeyPath = `${folderPath}.${lastPart}.meta.${key}`;
				await this.setObjectNotExistsAsync(metaKeyPath, {
					type: 'state',
					common: {
						name: `Meta: ${key}`,
						role: 'meta',
						type: determineType(value), // Dynamisch ermittelter Typ
						read: true,
						write: false
					},
					native: {}
				});
				await this.setStateAsync(metaKeyPath, { val: value, ack: true });
			}

			// Data-States als einzelne Einträge anlegen
			for (const [key, value] of Object.entries(data)) {
				const dataKeyPath = `${folderPath}.${lastPart}.data.${key}`;
				await this.setObjectNotExistsAsync(dataKeyPath, {
					type: 'state',
					common: {
						name: `Data: ${key}`,
						role: 'data',
						type: determineType(value), // Dynamisch ermittelter Typ
						read: true,
						write: true
					},
					native: {}
				});
				await this.setStateAsync(dataKeyPath, { val: value, ack: true });
			}

			// Antwort senden
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
