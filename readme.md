**Telegram Buy Bot**

This bot posts to channels it's joined to whenever a buy is made of any of the tokens that particular channel is subscribed to. Supports EVM-compatible blockchains.


**Instructions**

1.  Message @BotFather on Telegram to register a bot using ```/newbot``` and receive its authentication token. More details on that [here](https://core.telegram.org/bots/features#creating-a-new-bot).
2. Install [Node](https://nodejs.org/en/download/) if you haven't already.
3. Download this project's source code and place it somewhere nice.
4. Generate a user configuration file.
5. Download that as user-configs.json and place it just inside the source code folder
6. On Windows, double-click "bot.bat" just inside the source code folder to start the bot (other platforms coming soon but if you know what node is you can run it yourself at the command line on anything ;))
7. Once the bot is running, send it a ```/help``` message on Telegram to see the available options.


**Notes**

* Using the default free endpoints provided by Ankr will likely result in some buys not being relayed because of occasional rejections from the server.

* To run any kind of bots 24/7 and make it accessible from other computers, you can run it on a Virtual Private Server like [Digital Ocean](https://www.digitalocean.com/solutions/vps-hosting) for a few dollars a month (you would not need much in the way of computing power).

* This bot is built using [botiq](github.com/neauangle/botiq), a high-level library I created to make developing crypto bots easier- which, in turn, stands on the shoulders of the [ethers.js](https://docs.ethers.io/v5/) library developed by [ricmoo](https://github.com/ricmoo).