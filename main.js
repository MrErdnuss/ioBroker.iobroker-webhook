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
				.filter((part) => ('' + part).trim() !== '')
				.filter(Boolean);
			const folderPath = urlParts.slice(0, -1).join('.'); // Verzeichnis bis zum letzten Segment
			const lastPart = urlParts[urlParts.length - 1]; // Letztes Segment

			// Wenn `folderPath` leer ist, verwenden wir nur `lastPart`
			const basePath = folderPath ? `${folderPath}.${lastPart}` : lastPart;

			// Pfade für Meta- und Datenzustände
			const metaParentPath = `${basePath}.meta`;
			const dataParentPath = `${basePath}.data`;

			const meta = {
				ip: req.ip,
				method: req.method,
				timestamp: new Date().toISOString()
			};

			const data = req.body;

			// Funktion zur rekursiven Verarbeitung und Speicherung
			const processJson = async (data, parentPath) => {
				for (const key in data) {
					if (data.hasOwnProperty(key)) {
						const value = data[key];
						const currentPath = `${parentPath}.${key}`;

						if (typeof value === 'object' && value !== null) {
							// Wenn es ein weiteres Objekt ist, rekursiv verarbeiten
							await processJson(value, currentPath);
						} else {
							// Wenn es ein primitiver Wert ist, lege einen State an
							await this.setObjectNotExistsAsync(currentPath, {
								type: 'state',
								common: {
									name: key,
									role: 'state',
									type: determineType(value), // Typ des Werts ermitteln
									read: true,
									write: true
								},
								native: {}
							});

							// Wert des States setzen
							await this.setStateAsync(currentPath, { val: value, ack: true });
						}
					}
				}
			};

			// Metadaten und Daten verarbeiten
			await processJson(meta, metaParentPath); // Metadaten rekursiv speichern
			await processJson(data, dataParentPath); // Daten rekursiv speichern

			// Antwort senden
			res.setHeader('Content-Type', 'application/json');
			res.status(200).json({ status: 'success' });
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
