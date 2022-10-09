import botiq from 'botiq';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

/*
    TODO    
    ----


*/

const basicMessageOptions = {parse_mode: 'HTML', disable_web_page_preview: true};

const database = (() => {
    const databaseFilePath = './database.json';
    const trackers = {};
    let internalData;
    let initted = false;                 
    //exchangeName arg optional
    function addTracker(endpoint, tracker, exchangeName){
        trackers[tracker.id] = tracker;
        const trackerInfo = {
            trackerId: tracker.id,
            trackerTokenAddress: tracker.token.address,
            trackerComparatorAddress: tracker.comparator.address,
            trackerExchangeName: exchangeName || null,
            subscribers: [],
            listenerKey: null,
            chainName: endpoint.chainName
        }
        internalData.chains[endpoint.chainName].trackerInfos.push(trackerInfo);
        return trackerInfo;
    }
    function saveOut(){
        fs.writeFileSync(databaseFilePath, JSON.stringify(internalData));
    };
    const ret = {
        dumpLog: () => console.log(JSON.stringify(internalData, null, '    ')), 
        //exchangeName, initialSubscriberObject optional                     
        addSubscriber: async (endpoint, bot, chatId, token, comparator, exchangeName, initialSubscriberObject) => {
            let exchange;
            let matchedTrackerInfo = database.getTrackerInfoMatchingAddresses(endpoint, exchangeName, token, comparator);
            if (!matchedTrackerInfo){
                initted && bot.sendMessage(chatId, "Please wait while I establish a tracker for this pair...");
                if (exchangeName){
                    if (botiq.ethers.chains[endpoint.chainName].exchanges[exchangeName]){
                        exchange = botiq.ethers.chains[endpoint.chainName].exchanges[exchangeName];
                    } else {
                        if (initted){
                            bot.sendMessage(chatId, `No exchange "${exchangeName}" found under ${endpoint.chainName}`); 
                            return;
                        }
                        throw Error(`No exchange "${exchangeName}" found under ${endpoint.chainName}`);
                    }
                }
                const tracker = await endpoint.createTracker({
                    exchange,
                    tokenAddress: token,
                    comparatorAddress: comparator,
                });
                initted && bot.sendMessage(chatId, `Tracker established...`);
                matchedTrackerInfo = addTracker(endpoint, tracker, exchange.name);
            } else if (matchedTrackerInfo.trackerExchangeName) {
                exchange = botiq.ethers.chains[endpoint.chainName].exchanges[matchedTrackerInfo.trackerExchangeName];
            }
            if (!exchange){
                exchange = Object.values(botiq.ethers.chains[endpoint.chainName].exchanges)[0];
            }
        
            const tracker = database.getTracker(matchedTrackerInfo.trackerId);
            if (!matchedTrackerInfo.listenerKey){
                matchedTrackerInfo.listenerKey = tracker.addSwapListener({listener: async (swapDetails) => {
                    try {
                        await sendActionMessage(endpoint, bot, matchedTrackerInfo, swapDetails);
                    } catch (error){
                        console.log("Error sending action message", error);
                    }
                }})
            }
            if (matchedTrackerInfo.subscribers.some(subscriber => subscriber.chatId === chatId)){
                initted && bot.sendMessage(chatId, `Chat is already subscribed to ${tracker.token.symbol}-${tracker.comparator.symbol} swaps!`);
                return;
            }
            matchedTrackerInfo.subscribers.push(initialSubscriberObject || {
                chatId, 
                emoji: '💜',
                videoUrl: 'https://i.imgur.com/a7nT3ir.mp4',
                photoUrl: null,
                minimumFiatThreshold: 0,
                chainName: endpoint.chainName,
                exchangeName: exchange.name
            });
            if (!internalData.chatIdToSettings[chatId]){
                internalData.chatIdToSettings[chatId] = {muted: false};
            }
            initted && saveOut();
            initted && bot.sendMessage(chatId, `Chat is now subscribed to ${tracker.token.symbol}-${tracker.comparator.symbol} swaps!`);
        },
        removeSubscriber: async (bot, chatId, trackerIndex) => {
            database.updateSubscriber(bot, chatId, trackerIndex, (trackerInfo, tracker, subscriber) => {
                trackerInfo.subscribers = trackerInfo.subscribers.filter(sub => sub.chatId !== subscriber.chatId);
                if (!trackerInfo.subscribers.length){
                    tracker.removeListener({key: trackerInfo.listenerKey});
                    trackerInfo.listenerKey = null;
                }
                bot.sendMessage(subscriber.chatId, `Chat is no longer subscribed to ${tracker.token.symbol}-${tracker.comparator.symbol} swaps!`);
            });
        },
       getSubscriberAndTracker: (chatId, trackerIndex) => {
            const trackerInfo = database.getTrackerInfos(chatId)[trackerIndex];
            for (const subscriber of trackerInfo.subscribers){
                if (subscriber.chatId === chatId){
                    return {subscriber, tracker: trackers[trackerInfo.trackerId]};
                }
            }
        },
        
        getTrackerInfos: (chatIdFilter) => {
            let trackerInfos = [];
            for (const chain of Object.values(internalData.chains)){
                if (chatIdFilter === null || chatIdFilter === undefined){
                    trackerInfos = trackerInfos.concat(chain.trackerInfos);
                } else {
                    trackerInfos = trackerInfos.concat(
                        chain.trackerInfos.filter(trackerInfo => trackerInfo.subscribers.some(subscriber => subscriber.chatId === chatIdFilter))
                    );
                    
                }
            }
            return trackerInfos;
        },
        iterateTrackerInfos: async (chatIdFilter, callback) => {
            const trackerInfos = database.getTrackerInfos(chatIdFilter);
            let index = 0;
            for (const trackerInfo of trackerInfos){
                const tracker = trackers[trackerInfo.trackerId];
                if (await callback(trackerInfo, tracker, index++)){
                    return;
                }
            }
        },
        getTrackerInfoMatchingAddresses: (endpoint, exchangeName, tokenAddress, comparatorAddress) => {
            const trackerInfos = database.getTrackerInfos();
            for (const trackerInfo of trackerInfos){
                if (trackerInfo.chainName === endpoint.chainName){
                    const tracker = trackers[trackerInfo.trackerId];
                    //note: undefined exchangeName matches any in isEqualTo- an unspecified 
                    //exchangeName will try to match any existing first.
                    if (tracker && tracker.isEqualTo({token: tokenAddress, comparator: comparatorAddress, exchangeName})){
                        return trackerInfo;
                    }
                }
            }
        },
        getTracker: (trackerId) => {
            return trackers[trackerId];
        },
        updateChatSettings: async (chatId, callback) => {
            await callback(internalData.chatIdToSettings[chatId]);
            initted && saveOut();
        },
        getSettingsForChat: (chatId) => {
            return internalData.chatIdToSettings[chatId];
        },
        updateSubscriber: async (bot, chatId, trackerIndex, callback) => {
            const trackerInfo = database.getTrackerInfos(chatId)[trackerIndex];
            if (trackerInfo){
                const subscriber = trackerInfo.subscribers.filter(subscriber => subscriber.chatId === chatId)[0];
                if (subscriber){
                    const tracker = database.getTracker(trackerInfo.trackerId);
                    await callback(trackerInfo, tracker, subscriber);
                    initted && saveOut();
                    return;
                }
            } 
            bot.sendMessage(chatId, `Invalid tracker index ${trackerIndex}`);
        },
        init: async (endpoints, bot) => {
            internalData = {chains:{}, chatIdToSettings: {}};
            for (const endpoint of Object.values(endpoints)){
                internalData.chains[endpoint.chainName] = {trackerInfos: []};
                addTracker(endpoint, endpoint.nativeToFiatTracker);
            }
            
            const importedDataString = fs.existsSync(databaseFilePath) && fs.readFileSync(databaseFilePath).toString('utf-8');
            if (importedDataString){
                const importedData = JSON.parse(importedDataString);
                for (const chainName of Object.keys(importedData.chains)){
                    const endpoint = endpoints[chainName];
                    for (const trackerInfo of importedData.chains[chainName].trackerInfos){
                        const {trackerTokenAddress, trackerComparatorAddress, subscribers} = trackerInfo;
                        const trackerExchangeName = trackerInfo.trackerExchangeName; //optional
                        for (const subscriber of subscribers){
                            //must come before addSubscriber, where it will gert filled with default chat settings
                            if (!internalData.chatIdToSettings[subscriber.chatId]){
                                internalData.chatIdToSettings[subscriber.chatId] = importedData.chatIdToSettings[subscriber.chatId];
                            } 
                            //we automatically filter out unused data by filling the database via subscribers
                            await database.addSubscriber(endpoint, bot, subscriber.chatId, trackerTokenAddress, trackerComparatorAddress, trackerExchangeName, subscriber);
                            
                        }
                    }
                }
            }
            initted = true;
        }
    }; 
    return ret;
})();

const acceptedCommands = [
    {
        regex: /^\/start$/,
        usage: `/start`,
        description: `Starts the bot.`,
        handler: async (endpoints, bot, message, matchResult) => {
            bot.sendMessage(message.chat.id, `Why hello there 💜 I'm ready to interact! Please use /help to see a list of commands.`);
        }
    },
    {
        regex: /^\/help$/,
        usage: `/help`,
        description: `Shows a list of available commands.`,
        handler: async (endpoints, bot, message, matchResult) => {
            let helpText = 'Botiq Buy Bot\n\nSubscribe to a pair with /add_subscription and then edit it to suit your needs using the /set commands.';
            for (const acceptedCommand of acceptedCommands){
                if (helpText) helpText += '\n\n';
                helpText += acceptedCommand.usage + '\n' +  acceptedCommand.description;
            }
            bot.sendMessage(message.chat.id, helpText);
        }
    },
    {
        regex: /^\/mute\s+(on|off)$/i,
        usage: `/mute on | off`,
        description: `No swaps get relayed to the chat from any subsription while the bot is muted.`,
        handler: async (endpoints, bot, message, matchResult) => {
            database.updateChatSettings(message.chat.id, (chatSettings) => {
                const state = matchResult[1].toUpperCase();
                chatSettings.muted = state === 'ON';
                bot.sendMessage(message.chat.id, `Mute ${state}`);
            });            
        }
    },
    {
        regex: /^\/list_supported_chains$/,
        usage: `/list_supported_chains`,
        description: `Lists all supported chains.`,
        handler: async (endpoints, bot, message, matchResult) => {
            bot.sendMessage(message.chat.id, textListify('Supported chains', Object.keys(botiq.ethers.chains)), basicMessageOptions);
        }
    },
    {
        regex: /^\/list_supported_exchanges\s+(\w+)$/,
        usage: `/list_supported_exchanges <chain>`,
        description: `Lists all supported exchanges for a chain.`,
        handler: async (endpoints, bot, message, matchResult) => {
            if (!botiq.ethers.chains[matchResult[1]]){
                bot.sendMessage(message.chat.id, `Unsupported chain "${matchResult[1]}".`, basicMessageOptions);
                return;
            }
            const exchangeNames = Object.keys(botiq.ethers.chains[matchResult[1]].exchanges)
            bot.sendMessage(message.chat.id, textListify(`Supported exchanges for ${matchResult[1]}`, exchangeNames), basicMessageOptions);
        }
    },
    {
        regex: /^\/list_supported_symbols\s+(\w+)$/,
        usage: `/list_supported_symbols <chain>`,
        description: `Lists all supported symbol nicknames (e.g. USDC isntead of USDC's contract address) for a chain.`,
        handler: async (endpoints, bot, message, matchResult) => {
            if (!botiq.ethers.chains[matchResult[1]]){
                bot.sendMessage(message.chat.id, `Unsupported chain "${matchResult[1]}".`, basicMessageOptions);
                return;
            }
            const symbols = Object.keys(botiq.ethers.chains[matchResult[1]].tokenAddresses);
            bot.sendMessage(message.chat.id, textListify(`Supported symbols for ${matchResult[1]}`, symbols), basicMessageOptions);
        }
    },
    {
        regex: /^\/add_subscription\s+(\w+)\s+(\w+)\s+(\w+)(?:\s+(\w+))?$/,
        usage: `/add_subscription <chain> <tokenAddress> <comparatorAddress> [<exchange>]`,
        description: `Subscribes to a trading pair denoted by the tokenAddress (base) and comparatorAddress (quote) on a given chain. Certain symbols (/list_supported_symbols) like USDC and ETH are supported, depending on the chain.`,
        handler: async (endpoints, bot, message, matchResult) => {
            const endpoint = endpoints[matchResult[1]];
            const token = matchResult[2];
            const comparator = matchResult[3];
            try {
                await database.addSubscriber(endpoint, bot, message.chat.id, token, comparator, matchResult[4])
            } catch (error){
                console.log("Error adding subscription...",  message.chat.id, token, comparator, error)
                bot.sendMessage(message.chat.id, "Error adding subscription...");
            }
        }
    },
    {
        regex: /^\/list_subscriptions$/,
        usage: `/list_subscriptions`,
        description: `Retrieves the list of subscriptions this channel is subscribed to. The index of each subscription can be used to reference it in other commands.`,
        handler: async (endpoints, bot, message, matchResult) => {
            let text = ''
            await database.iterateTrackerInfos(message.chat.id, (trackerInfo, tracker, index) => {
                text += `\n[${index}] => ${tracker.token.symbol}-${tracker.comparator.symbol} on ${trackerInfo.chainName}`;
            });
            bot.sendMessage(message.chat.id, text || 'This channel has no subscriptions.');
        }
    },
    {
        regex: /^\/view_subscription\s+(\d+)$/,
        usage: `/view_subscription <index>`,
        description: `Returns the settings for a subscription in this chat.`,
        handler: async (endpoints, bot, message, matchResult) => {
            const result = database.getSubscriberAndTracker(message.chat.id, matchResult[1]);
            if (result){
                const {subscriber, tracker} = result;
                bot.sendMessage(
                    subscriber.chatId, 
                    `${tracker.token.symbol}-${tracker.comparator.symbol}: ${JSON.stringify(subscriber,null,  '  ')}`,
                    basicMessageOptions
                );
                return;
            }
            bot.sendMessage(message.chat.id, "Invalid command or arguments (try the /help command).");
        }
    },
    {
        regex: /^\/remove_subscription\s+(\d+)$/,
        usage: `/remove_subscription <index>`,
        description: `Unsubscribes from a subscription.`,
        handler: async (endpoints, bot, message, matchResult) => {
            await database.removeSubscriber(bot, message.chat.id, matchResult[1]);
            
        }
    },
    {   //https://stackoverflow.com/a/68146409 to match emojis!
        regex: /^\/set_emoji\s+(\d+)\s+(\w|\p{RI}\p{RI}|\p{RI}\p{RI}|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?(\u{200D}\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?)+|\p{EPres}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F}))$/u,
        usage: `/set_emoji <index> <emoji>`,
        description: `Changes the emoji that is used to represent the value of a trade for a tracker.`,
        handler: async (endpoints, bot, message, matchResult) => {
            database.updateSubscriber(bot, message.chat.id, matchResult[1], (trackerInfo, tracker, subscriber) => {
                subscriber.emoji = matchResult[2];
                bot.sendMessage(subscriber.chatId, `Emoji for ${tracker.token.symbol}-${tracker.comparator.symbol} updated to: ${subscriber.emoji}`);
            });
        }
    },
    {   
        regex: /^\/set_fiat_threshold\s+(\d+)\s+(\d+)/,
        usage: `/set_fiat_threshold <index> <fiatThreshold>`,
        description: `If a swap is worth below fiatThreshold for this tracker, no post will be made about it here (note: fiatThreshold must be a whole number).`,
        handler: async (endpoints, bot, message, matchResult) => {
            database.updateSubscriber(bot, message.chat.id, matchResult[1], (trackerInfo, tracker, subscriber) => {
                subscriber.minimumFiatThreshold = matchResult[2];
                bot.sendMessage(subscriber.chatId, `Fiat threshold for ${tracker.token.symbol}-${tracker.comparator.symbol} updated to: $${subscriber.minimumFiatThreshold}`);
            });
        }
    },
    {   //https://www.delftstack.com/howto/javascript/javascript-validate-url/ 
        regex: /^\/set_video_url\s+(\d+)\s+(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))$/u,
        usage: `/set_video_url <index> <videoUrl>`,
        description: `Changes the video/gif shown for each swap for a tracker.`,
        handler: async (endpoints, bot, message, matchResult) => {
            database.updateSubscriber(bot, message.chat.id, matchResult[1], (trackerInfo, tracker, subscriber) => {
                subscriber.videoUrl = matchResult[2];
                subscriber.photoUrl = null;
                bot.sendMessage(
                    subscriber.chatId, 
                    `Video URL for ${tracker.token.symbol}-${tracker.comparator.symbol} updated to: ${subscriber.videoUrl}`,
                    basicMessageOptions
                );
            });
        }
    },
    {  //https://www.delftstack.com/howto/javascript/javascript-validate-url/
        regex: /^\/set_photo_url\s+(\d+)\s+(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))$/u,
        usage: `/set_photo_url <index> <photoUrl>`,
        description: `Changes the image shown for each swap for a tracker.`,
        handler: async (endpoints, bot, message, matchResult) => {
            database.updateSubscriber(bot, message.chat.id, matchResult[1], (trackerInfo, tracker, subscriber) => {
                subscriber.photoUrl = matchResult[2];
                subscriber.videoUrl = null;
                bot.sendMessage(
                    subscriber.chatId, 
                    `Photo URL for ${tracker.token.symbol}-${tracker.comparator.symbol} updated to: ${subscriber.photoUrl}`,
                    basicMessageOptions
                );
            });
        }
    },
    {  //https://www.delftstack.com/howto/javascript/javascript-validate-url/
        regex: /^\/set_custom_links\s+(\d+)(?:\s+((?:[a-zA-Z]+\s+https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)\s?)*))?$/u,
        usage: `/set_custom_links <index> [<hypertext> <url>, ...]`,
        description: `Changes the links shown at the bottom of each post. <hypertext> is the text shown while <url> is the link.`,
        handler: async (endpoints, bot, message, matchResult) => {
            database.updateSubscriber(bot, message.chat.id, matchResult[1], (trackerInfo, tracker, subscriber) => {
                const links = [];
                if (matchResult[2]){
                    const fields = matchResult[2].split(/\s+/);
                    for (let i = 0; i < fields.length; i += 2){
                        links.push({
                            hypertext: fields[i],
                            url: fields[i+1]
                        })
                    }
                }
                subscriber.customLinks = links;
                bot.sendMessage(
                    subscriber.chatId, 
                    `Custom links for ${tracker.token.symbol}-${tracker.comparator.symbol} updated to: ${JSON.stringify(links,null,  '  ')}`,
                    basicMessageOptions
                );
            });
        }
    },
    {
        regex: /^\/price\s+(\d+)$/,
        usage: `/price <index>`,
        description: `Show the current price for the given subscription.`,
        handler: async (endpoints, bot, message, matchResult) => {
            database.updateSubscriber(bot, message.chat.id, matchResult[1], async (trackerInfo, tracker, subscriber) => {
                const price = await tracker.getNewPrice();
                let reply = '';
                if (tracker.pair.comparatorIsFiat){
                    reply = `1 ${tracker.token.symbol} = $${botiq.util.locale(price.comparator.string)}`;
                } else {
                    reply = `1 ${tracker.token.symbol} = ${botiq.util.locale(price.comparator.string)} ${tracker.comparator.symbol}`;
                    if (price.fiat.string){
                        reply += `\n1 ${tracker.token.symbol} ≈ $${botiq.util.locale(price.fiat.string)}`;
                    }
                }
                bot.sendMessage(subscriber.chatId, reply, basicMessageOptions);
            });
        }
    },
    
]


function textListify(title, array){
    if (array.length){
        return `<b>${title}:</b>\n* ` + array.join('\n* ');
    } else {
        return `<b>${title}:</b>\n`;
    }

}


export async function run(configs){
    const bot = new TelegramBot(configs.telegramAccessToken, {polling: true});
    const endpoints = {};
    for (const endpointDetails of Object.values(configs.chainEndpoints)){
        const endpoint = await botiq.ethers.createJsonRpcEndpoint({
            accessURL: endpointDetails.url,
            rateLimitPerSecond: endpointDetails.rateLimitPerSecond
        })
        endpoints[endpoint.chainName] = endpoint;
    }
    await database.init(endpoints, bot);
    console.log("Database Initiated!");

    const commands = [];
    for (const acceptedCommand of acceptedCommands){
        commands.push({command: acceptedCommand.usage.split(' ')[0].slice(1), description: acceptedCommand.description});
    }
    await bot.setMyCommands(commands);

    bot.on('message', async (message) => {
        if (! await verifySender(bot, message)){
            bot.sendMessage(message.chat.id, "La la la, only admins can talk to me!");
            return;
        }
        for (const acceptedCommand of acceptedCommands){
            const matchResult = message.text.match(acceptedCommand.regex);
            if (matchResult){
                acceptedCommand.handler(endpoints, bot, message, matchResult);
                return;
            }
        }
        bot.sendMessage(message.chat.id, "Invalid command or arguments (try the /help command).");
    });
}


async function verifySender(bot, message){
    if (message.chat.type === 'private'){
        return true;
    }
    try {
        const chatAdmins = await bot.getChatAdministrators(message.chat.id);
        if (chatAdmins.some(admin => admin.user.id === message.from.id)){
            return true;
        }
    } catch {    }
}






async function sendActionMessage(endpoint, bot, trackerInfo, swapDetails){
    const tracker = database.getTracker(trackerInfo.trackerId);
    if (swapDetails.action === 'SELL'){
        return;
    }

    const extraDetails = await getExtraTrackerDetails(endpoint, tracker, swapDetails);
    
    const lines = [];
    let emojiLineIndex;
    lines.push(`<b>${tracker.token.symbol} ${botiq.util.toCapitalCase(swapDetails.action)}!</b>`);
    if (swapDetails.fiatQuantity.string){
        lines.push(`<emoji line>`);
        emojiLineIndex = lines.length - 1;
    }
    
    
    lines.push('');
    if (tracker.pair.comparatorIsFiat){
        lines.push(`<b>Spent:</b> $${botiq.util.locale(swapDetails.comparatorQuantity.string)}`);
    } else {
        lines.push(`<b>Spent:</b> ${botiq.util.locale(swapDetails.comparatorQuantity.string)} ${tracker.comparator.symbol}`);
        if (swapDetails.fiatQuantity.string){
            lines.push(`         ≈ $${botiq.util.locale(botiq.util.roundAccurately(swapDetails.fiatQuantity.string, 2))}`);
        }
    }
    lines.push(`<b>Got:</b> ${botiq.util.locale(swapDetails.tokenQuantity.string)} ${tracker.token.symbol}`);

    lines.push(`<b>Wallet Position:</b> ${extraDetails.walletPosition}`);
    lines.push(`<b>Wallet Balance:</b> ${extraDetails.walletBalance.string}`);
    
    if (tracker.pair.comparatorIsFiat){
        lines.push(`<b>Price:</b> $${botiq.util.locale(swapDetails.averageTokenPriceComparator.string)}`);
    } else {
        lines.push(`<b>Price:</b> ${botiq.util.locale(swapDetails.averageTokenPriceComparator.string)} ${tracker.comparator.symbol}`);
        if (swapDetails.averageTokenPriceFiat.string){
            let fiatPrice = swapDetails.averageTokenPriceFiat.string;
            if (swapDetails.averageTokenPriceFiat.rational.greater(0.05)){
                fiatPrice = botiq.util.roundAccurately(swapDetails.averageTokenPriceFiat.string, 2)
            }
            lines.push(`         ≈ $${botiq.util.locale(fiatPrice)}`);
        }
    }
    if (extraDetails.marketCap.fiat.string){
        lines.push(`<b>Market Cap:</b> $${botiq.util.locale(botiq.util.roundAccurately(extraDetails.marketCap.fiat.string, 2))}`);
    } else {
        lines.push(`<b>Market Cap:</b> ${botiq.util.locale(botiq.util.roundAccurately(extraDetails.marketCap.comparator.string, 2))} ${tracker.comparator.symbol}`);
    }

    
    trackerInfo.subscribers.forEach(subscriber => {
        if (database.getSettingsForChat(subscriber.chatId).muted){
            return;
        }
        if (swapDetails.fiatQuantity.string && swapDetails.fiatQuantity.rational.lesser(subscriber.minimumFiatThreshold)){
            return;
        }

        const subscriberLines = [...lines];
        let footerLine = `<b><a href="${extraDetails.transactionUrl}">TX</a>`;
        footerLine += ` | <a href="${extraDetails.chartUrl}">Chart</a>`;
        footerLine += ` | <a href="${extraDetails.walletUrl}">Buyer</a>`;
        let exchangeName = subscriber.trackerExchangeName;
        if (!exchangeName){
            exchangeName = Object.keys(botiq.ethers.chains[endpoint.chainName].exchanges)[0];
        }
        const exchange = botiq.ethers.chains[subscriber.chainName].exchanges[exchangeName];
        if (exchange.url){
            const url = exchange.url.replace('<tokenAddress>', tracker.token.address);
            footerLine += ` | <a href="${url}">${botiq.util.toCapitalCase(exchangeName)}</a>`;
        }
        if (subscriber.customLinks){
            for  (const customLink of subscriber.customLinks){
                footerLine += ` | <a href="${customLink.url}">${customLink.hypertext}</a>`;
            }
        }
        footerLine += '</b>';
        subscriberLines.push('')
        subscriberLines.push(footerLine);
        

        if (emojiLineIndex !== undefined){
            let emojiText = '';
            for (let i = 0; i < Number(swapDetails.fiatQuantity.string) / 50; ++i){
                emojiText += subscriber.emoji;
            }
            subscriberLines[emojiLineIndex] = emojiText;
        }
        const text = subscriberLines.join('\n');
        
        if (subscriber.videoUrl){
            bot.sendAnimation(subscriber.chatId, subscriber.videoUrl, {...basicMessageOptions, caption: text});
        } else if (subscriber.photoUrl){
            bot.sendPhoto(subscriber.chatId, subscriber.photoUrl, {...basicMessageOptions, caption: text});
        } else {
            bot.sendMessage(subscriber.chatId, text, basicMessageOptions);
        }
    });
}

async function getExtraTrackerDetails(endpoint, tracker, swapDetails){
    const transactionresponse = await endpoint.provider.getTransaction(swapDetails.parsedLog.transactionHash);
    const transactionReceipt = await transactionresponse.wait();
    const walletAddress = transactionReceipt.from;
    const walletBalance = await endpoint.getBalance({tokenAddress: tracker.token.address, walletAddress});
    const oldWalletBalanceRational = walletBalance.rational.minus(swapDetails.tokenQuantity.rational);
    let walletPosition = 'NEW!';
    if (oldWalletBalanceRational.greater(0)){
        const walletPositionRational = walletBalance.rational.divide(oldWalletBalanceRational).multiply(100).minus(100);
        if (walletPositionRational.greater(1000)){
            walletPosition = '> 1000%!!';
        } else {
            walletPosition = '⬆️ ' + botiq.util.formatRational(walletPositionRational, 2) + '%';
        }
        
    } else if (walletBalance.string === '0'){
        walletPosition = 'Probable Sandwich Bot or Proxy';
    }

    const extraDetails =  await botiq.ethers.getLiquidityTotalSupplyMarketCap({tracker});
    extraDetails.walletPosition = walletPosition;
    extraDetails.walletPreviousBalance = {rational: oldWalletBalanceRational, string: botiq.util.formatRational(oldWalletBalanceRational, tracker.token.decimals)};
    extraDetails.walletBalance = walletBalance;
    extraDetails.walletUrl = botiq.ethers.chains[endpoint.chainName].addressUrl.replace('<address>', walletAddress);
    extraDetails.transactionUrl = botiq.ethers.chains[endpoint.chainName].transactionUrl.replace('<transactionHash>', transactionReceipt.transactionHash);
    extraDetails.chartUrl = botiq.ethers.chains[endpoint.chainName].chartUrl.replace('<pairAddress>', tracker.pair.address);

    return extraDetails;
}


const configs = JSON.parse(fs.readFileSync('./user-configs.json'));
await run(configs);