const express = require('express');
const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');
var {exec} = require('child_process');
const axios = require('axios');
const https = require("https");
/**
 * Represents an instance of an HTTPS agent.
 *
 * @class
 */
const agent = new https.Agent({ rejectUnauthorized: false });
/**
 * @description A variable that holds an instance of an Express application.
 * @type {object}
 */
const app = express();
app.use(express.json()); // Enable JSON req.body parsing

/**
 * Represents the secret key for encryption or authentication purposes.
 *
 * @type {string}
 * @readonly
 * @description This variable stores a randomly generated secret key that is used for encryption or authentication operations.
 *               The secret key is a string consisting of a combination of uppercase letters (A-Z), lowercase letters (a-z),
 *               digits (0-9), and special characters (!@#$%^&*()_+-=[]{};':"|,./<>?). It is important to keep this key
 *               confidential and secure to ensure the integrity and security of the system.
 */
const secretKey = '';
/**
 * Represents the owner of the bot.
 *
 * @type {string}
 */
const botOwner = ''; // replace with your Twitch username
/**
 * Represents the username of the bot.
 *
 * @type {string}
 */
const botUsername = ''; // replace with your bot's username
/**
 * Represents the authentication token for the bot.
 *
 * @type {string}
 */
const botToken = 'oauth:'; // replace with your bot's oauth token
/**
 * Represents the main channel that the bot is associated with.
 *
 * @type {string}
 */
const mainChannel = botUsername; // replace with the bot's main channel
/**
 * The path to the 'channels.json' file.
 *
 * @type {string}
 */
const channelsFile = path.join(__dirname, 'channels.json');
/**
 * URL of the API endpoint for accessing the MultiChat application.
 *
 * @type {string}
 */
const apiUrl = 'https://randomtwitch.chat/api'

// Read channels from JSON file
/**
 * Reads the channels from the channels file and returns them.
 *
 * If the channels file doesn't exist, a new file is created and initialized
 * with a single channel (mainChannel).
 *
 * If the channels array doesn't include the mainChannel, it is added to the array
 * and the updated channels array is written back to the channels file.
 *
 * @return {Array} The channels array read from the channels file.
 */
function readChannels() {
    if (!fs.existsSync(channelsFile)) {
        fs.writeFileSync(channelsFile, JSON.stringify([mainChannel]));
    }
    const channels = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
    if (!channels.includes(mainChannel)) {
        channels.push(mainChannel);
        writeChannels(channels);
    }
    return channels;
}

// Write channels to JSON file
/**
 * Writes the given channels object to a file in JSON format.
 *
 * @param {object} channels - The channels object to be written to file.
 *
 * @return {void}
 */
function writeChannels(channels) {
    fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2));
}

// Define the TMI client
/**
 * Represents a Twitch client for interacting with the Twitch Messaging Interface (TMI).
 * @class
 */
let client = new tmi.Client({
    options: { debug: true },
    identity: {
        username: botUsername,
        password: botToken,
    },
    channels: readChannels()
});

/**
 * Reconnects the client by disconnecting it and then restarting the server.
 *
 * @function reconnectClient
 * @returns {Promise} A Promise that resolves when the client is reconnected successfully.
 */
function reconnectClient() {
    client.disconnect().then(() => {
        exec("pm2 restart index.js")
    });
}

client.connect().catch(console.error);

client.on('connected', () => {
    console.log(`Connected to channels: ${client.getOptions().channels.join(', ')}`);
});

// all
client.on('message', (channel, tags, message, self) => {
    if (self) return;

    const command = message.trim();
    const isBroadcaster = tags.badges && 'broadcaster' in tags.badges;
    const isModerator = tags.mod || isBroadcaster;

    // Ping command available in any channel
    // if (command === '!ping') {
    //     client.say(channel, `Pong!`);
    // }

    // Check if user is mod or broadcaster
    if (isModerator ?? isBroadcaster) {
        if(command.startsWith('!blacklist ')) {
            const username = command.split(' ')[1];
            axios.post(apiUrl + '/blacklist', { username: username, key: secretKey, channel_name: channel.slice(1), status: true }, { httpsAgent: agent })
                .then(response => {
                    client.say(channel, `${username} has been blacklisted from your channel.`);
                })
                .catch(error => {
                    console.error('Error adding user to blacklist:', error);
                    client.say(channel, `Failed to blacklist ${username}.`);
                });
        }

        if(command.startsWith('!unblacklist ')) {
            const username = command.split(' ')[1];
            axios.post(apiUrl + '/blacklist', { username: username, key: secretKey, channel_name: channel.slice(1), status: false }, { httpsAgent: agent })
                .then(response => {
                    client.say(channel, `${username} has been removed from your channels blacklist.`);
                })
                .catch(error => {
                    console.error('Error removing user from blacklist:', error);
                    client.say(channel, `Failed to unblacklist ${username}.`);
                });
        }
    }
});

// bot
client.on('message', (channel, tags, message, self) => {
    if (self) return;

    const command = message.trim();
    const username = tags.username;

    if (channel === `#${mainChannel}`) {
        if (command.startsWith('!join')) {
            if (!client.getOptions().channels.includes(`#${username}`)) {
                // Use API to add channel dynamically
                axios.post(apiUrl + '/channels/add', { channel: username, key: secretKey }, { httpsAgent: agent })
                    .then(response => {
                        const channels = readChannels();
                        channels.push(username);
                        writeChannels(channels);
                        client.say(channel, `Joined ${username}'s channel!`);
                        reconnectClient();
                    })
                    .catch(error => {
                        console.error('Error adding channel:', error);
                        client.say(channel, `Failed to join ${username}'s channel.`);
                    });
            } else {
                client.say(channel, `Already in ${username}'s channel.`);
            }
        }

        if (command.startsWith('!leave')) {
            if (client.getOptions().channels.includes(`#${username}`)) {
                // Use API to remove channel dynamically
                axios.post(apiUrl + '/channels/remove', { channel: username, key: secretKey }, { httpsAgent: agent })
                    .then(response => {
                        let channels = readChannels();
                        channels = channels.filter(chan => chan !== username);
                        writeChannels(channels);
                        client.say(channel, `Left ${username}'s channel!`);
                        reconnectClient();
                    })
                    .catch(error => {
                        console.error('Error removing channel:', error);
                        client.say(channel, `Failed to leave ${username}'s channel.`);
                    });
            } else {
                client.say(channel, `Not in ${username}'s channel.`);
            }
        }


        if (username === botOwner) {
            if (command.startsWith('!forcejoin ')) {
                const targetChannel = command.split(' ')[1];
                if (targetChannel && !client.getOptions().channels.includes(`#${targetChannel}`)) {
                    axios.post(apiUrl + '/channels/add', { channel: targetChannel, key: secretKey }, { httpsAgent: agent })
                        .then(response => {
                            let channels = readChannels();
                            channels.push(targetChannel)
                            writeChannels(channels);
                            client.say(channel, `Force Joined ${targetChannel}'s channel!`);
                            reconnectClient();
                        })
                        .catch(error => {
                            console.error('Error removing channel:', error);
                            client.say(channel, `Failed to join ${targetChannel}'s channel.`);
                        });
                } else {
                    client.say(channel, `Already in ${targetChannel}'s channel or invalid channel.`);
                }
            }

            if (command.startsWith('!forceleave ')) {
                const targetChannel = command.split(' ')[1];
                if (targetChannel && client.getOptions().channels.includes(`#${targetChannel}`)) {
                    axios.post(apiUrl + '/channels/remove', { channel: targetChannel, key: secretKey }, { httpsAgent: agent })
                        .then(response => {
                            let channels = readChannels();
                            channels = channels.filter(chan => chan !== targetChannel);
                            writeChannels(channels);
                            client.say(channel, `Left ${username}'s channel!`);
                            reconnectClient();
                        })
                        .catch(error => {
                            console.error('Error removing channel:', error);
                            client.say(channel, `Failed to leave ${username}'s channel.`);
                        });
                } else {
                    client.say(channel, `Not in ${targetChannel}'s channel or invalid channel.`);
                }
            }
        }
    }
});

app.post('/send', (req, res) => {
    const { message, key, channel } = req.body;

    // check the secret key
    if (key !== secretKey) {
        return res.status(401).send({ error: 'Unauthorized' });
    }

    if (!message) {
        return res.status(400).send({ error: 'Message is required' });
    }

    if (!channel) {
        return res.status(400).send({ error: 'Channel is required' });
    }

    client.say(channel, message)
        .then(() => res.send({ status: 'Message sent' }))
        .catch((err) => res.status(500).send({ error: 'Failed to send message', details: err.message }));
});

app.get('/', (req, res) => {
    res.sendStatus(404);
});

/**
 * The port variable determines the port number on which the application will listen for incoming requests.
 * It is derived from the environment variable 'PORT', if set; otherwise, it defaults to 3000.
 *
 * @type {number}
 */
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
