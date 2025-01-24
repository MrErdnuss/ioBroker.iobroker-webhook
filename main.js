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
		this.server = null;
	}

	async onReady() {
		const port = this.config.port || 8080;
		this.log.info(`Starting Webhook server on port ${port}`);

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

			// Logge die eingehende Anfrage
			this.log.debug(`Received request: ${req.method} ${req.originalUrl}`);
			this.log.debug(`Request Body: ${JSON.stringify(data)}`);

			const metaPath = `${folderPath}.${lastPart}.meta`;
			const dataPath = `${folderPath}.${lastPart}.data`;

			// Erstelle das Meta-Objekt, wenn es noch nicht existiert
			try {
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
				this.log.info(`Created meta object at ${metaPath}`);
			} catch (error) {
				this.log.error(`Error creating meta object at ${metaPath}: ${error.message}`);
			}

			// Erstelle das Daten-Objekt, wenn es noch nicht existiert
			try {
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
				this.log.info(`Created data object at ${dataPath}`);
			} catch (error) {
				this.log.error(`Error creating data object at ${dataPath}: ${error.message}`);
			}

			// Speichere die Meta-Informationen und die Daten
			try {
				await this.setStateAsync(metaPath, { val: JSON.stringify(meta), ack: true });
				this.log.debug(`Meta information saved at ${metaPath}: ${JSON.stringify(meta)}`);

				await this.setStateAsync(dataPath, { val: JSON.stringify(data), ack: true });
				this.log.debug(`Data saved at ${dataPath}: ${JSON.stringify(data)}`);
			} catch (error) {
				this.log.error(`Error saving state at ${metaPath} or ${dataPath}: ${error.message}`);
			}

			// Antwort zurück an den Client
			res.send('OK');
		});

		this.server = app.listen(port, () => {
			this.log.info(`Webhook server running on port ${port}`);
		});
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
