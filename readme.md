**Telegram Buy Bot**

This bot posts to channels it's joined to whenever a buy is made of any of the tokens that particular channel is subscribed to. Supports EVM-compatible blockchains.


**Instructions**

1.  Message @BotFather on Telegram to register a bot via /newbot and receive its authentication token. More details on that [here](https://core.telegram.org/bots/features#creating-a-new-bot).
2. Install [Node](https://nodejs.org/en/download/) if you haven't already.
3. Download this project and extract it somewhere nice.
4. Generate a user config file.
5. Download that as user-configs.json and place it just inside the project folder (the same folder where "bot.bat" is located).
6. On Windows, double-click "bot.bat" to start the bot. Note: if the bot hasn't been run before it will automatically install the dependencies (like [botiq](github.com/neauangle/botiq)) that it needs to run.
7. Once the bot is running, send it a /help message on Telegram to see the available options.


**Notes**

* Using the default free endpoints provided by Ankr will likely result in some buys not being relayed because of occasional rejections from their servers.

* To run any kind of bot 24/7 and make it accessible from other computers, you can run it on a Virtual Private Server like [Digital Ocean](https://www.digitalocean.com/solutions/vps-hosting) for a few dollars a month (you would not need much in the way of computing power).