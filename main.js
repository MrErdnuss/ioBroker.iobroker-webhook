'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

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
			if (req.path === '/favicon.ico') {
				res.status(204).end(); // 204 = No Content
				return;
			}
			const urlParts = req.path.split('/').filter(Boolean); // Pfad in Teile zerlegen
			const folderPath = urlParts.join('.'); // Alle Pfad-Teile zu einem Pfad für States zusammenfügen

			const meta = {
				ip: req.ip,
				method: req.method,
				timestamp: new Date().toISOString()
			};

			// Meta-Informationen speichern
			const metaPath = `${folderPath}.meta`;

			await this.setObjectNotExistsAsync(metaPath, {
				type: 'state',
				common: {
					name: 'Meta information',
					role: 'meta',
					type: 'string',
					read: true,
					write: false
				},
				native: {}
			});

			await this.setStateAsync(metaPath, { val: JSON.stringify(meta), ack: true });

			// Daten aus GET-Parametern oder POST-Body extrahieren
			const data = req.method === 'GET' ? req.query : req.body;

			// Für jeden Key im `data`-Objekt einen eigenen State anlegen
			if (data && typeof data === 'object') {
				for (const [key, value] of Object.entries(data)) {
					const statePath = `${folderPath}.${key}`;

					await this.setObjectNotExistsAsync(statePath, {
						type: 'state',
						common: {
							name: `Data for ${key}`,
							role: 'data',
							type: 'string',
							read: true,
							write: true
						},
						native: {}
					});

					await this.setStateAsync(statePath, { val: String(value), ack: true });
				}
			}

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
