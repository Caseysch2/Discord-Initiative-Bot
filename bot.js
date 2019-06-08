// Required libraries/files/variables
var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');
var configFile = require('./config.js');
var isRolling = false;
var numMonsters = 0;
var monsterRolls = [];
var failedToRoll = [];

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});

bot.on('message', function (user, userID, channelID, message, evt) {
    // Listen for messages that will start with `!`
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
       
        args = args.splice(1);
        switch(cmd) {
            case 'hi':
                bot.sendMessage({
                    to: channelID,
                    message: 'Hello to you too.'
                });
            break;
            case 'help':
                bot.sendMessage({
                    to: channelID,
                    message: getHelpMessage()
                });
            break;
			case "config":
				bot.sendMessage({
					to: channelID,
					message: getConfigMessage()
				});
            break;
			case "start":	
				bot.sendMessage({
					to: channelID,
					message: getThePartyStarted(user, args[0])
				});
            break;
			case "end":	
				bot.sendMessage({
					to: channelID,
					message: rageQuit(user)
				});
			break;
			case "toggle":
				bot.sendMessage({
					to: channelID,
					message: toggleRollMethod(user, args.join(" "))
				});
			break;
			default:
				var initRoll = Number(cmd);
				if (!isNaN(initRoll)) {
					bot.sendMessage({
						to: channelID,
						message: rollForCharacter(user, initRoll)
					});					
				} else {
					bot.sendMessage({
						to: channelID,
						message: "I haven't coded that pathway yet."
					});	
				}			
            break;
         }
     }
});

// Get a message describing the commands for this bot
function getHelpMessage() {		
	var message = "**The following commands are available to all users**";
	message += "\n**!config**: shows the default players and their roll method";
	message += "\n**!toggle [character name]**: switches the given character between automatic or manual rolls";
	message += "\n**![number]**: the user rolls for the characters they control, in order listed by !config";
	message += "\n\n**The following commands are available only to the DM " + configFile.DMName + "**";
	message += "\n**!start [number]**: starts a round of initiative rolls, including [number] monsters.";
	message += "\n**!end**: finishes a round of initiative rolls, rolling automatically for those who haven't rolled yet";
	message += "\n**![number]**: rolls for the next monster";
	message += "\n**!toggle monsters**: switches the monsters between automatic or manual rolls (automatic by default)";
	
	return message;
}

// Get a message describing the players noted in the config
function getConfigMessage() {
	var message = "";
	var numChar = 0;
	for( var i = 0; i < configFile.config.length; i++) {
		for( var y = 0; y < configFile.config[i].characters.length; y++) {
			numChar++;
			message += "\n**" + configFile.config[i].characters[y].name + "** (played by " + configFile.config[i].username + ", rolls are ";
			message += configFile.config[i].characters[y].auto ? "automatic)" : "manual)";
		}
	}
	message = numChar != 1 ? "There are " + numChar + " players in the config."  + message : "There is " + numChar + " player in the config." + message;	
	message = configFile.autoMonsters ? "**DM " + configFile.DMName + "** is allowing the monsters to control their own destiny.\n" + message:
		"**DM " + configFile.DMName + "** is rolling for the monsters.\n" + message; 
	return message;
}

// Begin an initiative roll round (only DM is allowed to begin this) and return a message saying who's rolling.
function getThePartyStarted(user, monsters) {
	if (user != configFile.DMName) {
		return "Only **DM " + configFile.DMName + "** can start rolls.";
	}
	
	isRolling = true;
	numMonsters = Number(monsters);
	numMonsters = isNaN(numMonsters) ? 0 : numMonsters;
	message = "Starting initiative rolls, there ";
	message += numMonsters == 0 ? "are no enemies." : numMonsters == 1 ? "is 1 enemy." : "are " + numMonsters + " enemies.";	
	monsterRolls = [];
	failedToRoll = [];
					
	for( var i = 0; i < configFile.config.length; i++) {
		message += "\n**" + configFile.config[i].username + ":** ";
		characterRolls = [configFile.config[i].characters.length];
		for( var y = 0; y < configFile.config[i].characters.length; y++) {
			if (configFile.config[i].characters[y].auto) {
				characterRolls[y] = configFile.config[i].characters[y].name + " is auto-rolling";							
				configFile.config[i].characters[y].result = getRandomRoll();
			} else {
				characterRolls[y] = "roll for " + configFile.config[i].characters[y].name;
				configFile.config[i].characters[y].result = 0;
			}
		}
		message += characterRolls.join(", ");
	}
	if (configFile.autoMonsters) {
		for(var i = 0; i < numMonsters; i++) {
			monsterRolls.push(getRandomRoll());
		}
	} else {
		message += "\n**DM " + configFile.DMName + "**, please roll for the monsters.";
	}
	
	// Check if everyone is auto-rolling
	var doneMessage = checkDone();
	if (doneMessage == "") {
		isRolling = false;
		return "Everyone is auto-rolling, including the " + numMonsters + " enemies.\n"+ showInitiative();
	} else {				
		return message;
	}
}

// Finish the initiative roll round. Anyone who hasn't rolled will be rolled for automatically. Return the results.
function rageQuit(user) {
	if (!isRolling) {			
		return "But we're not... even... rolling?";
	}	
	if (user != configFile.DMName) {			
		return "YOU'RE NOT MY SUPERVISOR.";
	}
	
	// Roll for remaining characters. Anyone who was supposed to manually roll gets a bonus.
	var message = "Y'all took too long. Remaining rolls have been done automatically.";
	for( var i = 0; i < configFile.config.length; i++) {
		for( var y = 0; y < configFile.config[i].characters.length; y++) {
			if (configFile.config[i].characters[y].result == 0) {
				configFile.config[i].characters[y].result = getRandomRoll();
				failedToRoll.push(configFile.config[i].characters[y].name);
			}
		}
	}	
	for (var i = monsterRolls.length; i < numMonsters; i++) {
		monsterRolls.push(getRandomRoll());
	}
	
	isRolling = false;
	doneMessage = showInitiative();
	return message + "\n" + doneMessage;
}

// Toggle if someone is auto-rolling or not
function toggleRollMethod(user, charName) {
	if (isRolling) {			
		return "Wait until after rolls, please. I didn't bother to logic that out.";
	}
	
	var message = "";
	if (charName == "monsters") {
		if (user == configFile.DMName) {
			configFile.autoMonsters = !configFile.autoMonsters;
			message = "Monsters are now";
			message += configFile.autoMonsters ? " auto-rolled." : " manually rolled.";
		} else {
			message = "You're not the DM, leave the monsters alone.";
		}
	} else {						
		for( var i = 0; i < configFile.config.length; i++) {
			for( var y = 0; y < configFile.config[i].characters.length; y++) {
				if (configFile.config[i].characters[y].name == charName) {
					if ( user == configFile.DMName || user == configFile.config[i].username) {						
						configFile.config[i].characters[y].auto = !configFile.config[i].characters[y].auto;
						message = charName + " is now";
						message += configFile.config[i].characters[y].auto ? " auto-rolling." : " manually rolling.";
					} else {
						return "Don't touch what isn't yours, " + user + ". It's rude.";
					}
				}
			}
		}
	}
	return message == "" ? "I don't know this '" + charName + "' you're talking about." : message;
}

// Return a string calling out who still hasn't rolled, or empty string if all rolling is complete.
function checkDone() {
	var remainingRolls = "";
	for( var i = 0; i < configFile.config.length; i++) {
		for( var y = 0; y < configFile.config[i].characters.length; y++) {
			if (configFile.config[i].characters[y].result == 0) {
				remainingRolls += configFile.config[i].characters[y].name + " (**" + configFile.config[i].username + "**), ";
			}
		}
	}
	if (remainingRolls != "") {
		remainingRolls = "Waiting for " + remainingRolls.slice(0, -2) + "\n";
	}
	
	if (numMonsters > monsterRolls.length) {
		var monstersLeft = numMonsters - monsterRolls.length;
		remainingRolls += "Waiting for DM **" + configFile.DMName + "** to roll for ";
		remainingRolls += monstersLeft > 1 ? monstersLeft + " monsters." : monstersLeft + " monster.";
	}
	
	return remainingRolls;
}

// Return a string with the sorted initiative results
function showInitiative() {
	message = "**INITIATIVE RESULTS:**```"	
	var tableResults = [];
	for( var i = 0; i < configFile.config.length; i++) {
		for( var y = 0; y < configFile.config[i].characters.length; y++) {
			if (configFile.config[i].characters[y].auto || failedToRoll.includes(configFile.config[i].characters[y].name)) {
				tableResults.push({
					desc: configFile.config[i].characters[y].name + " (" +
						configFile.config[i].characters[y].result + "+" + configFile.config[i].characters[y].bonus + " auto-roll)",
					roll: configFile.config[i].characters[y].result + configFile.config[i].characters[y].bonus
				});
			} else {
				tableResults.push({
					desc: configFile.config[i].characters[y].name + " (manual roll, includes +" + configFile.config[i].characters[y].bonus + ")",
					roll: configFile.config[i].characters[y].result
				});
			}
		}
	}
	for( var m = 0; m < monsterRolls.length; m++) {
		tableResults.push({
			desc: "MONSTER " + (m+1),
			roll: monsterRolls[m]
		});
	}
	
	tableResults = tableResults.sort((a, b) => { return b.roll - a.roll ; });
	for (var l = 0; l < tableResults.length; l++) {
		message += tableResults[l].roll < 10 ? "\n " : "\n";
		message += tableResults[l].roll + " " + tableResults[l].desc;
	}
	
	return message + "```";
}

// Attempt to assign a roll to a character controlled by the user and return confirmation
function rollForCharacter(user, initRoll) {
	if (!isRolling) {
		return "We're not doing rolls yet, hold your horses.";
	}
	
	var message = "";
	if (user == configFile.DMName) {
		if (monsterRolls.length < numMonsters) {
			monsterRolls.push(initRoll);
			message = user + " rolled a " + initRoll + " for monster " + monsterRolls.length;
		} else {
			return "You've rolled for all " + numMonsters + " monsters already.";
		}
	}
	
	for( var i = 0; i < configFile.config.length; i++) {
		if (configFile.config[i].username == user) {
			for( var y = 0; y < configFile.config[i].characters.length; y++) {
				if (configFile.config[i].characters[y].result == 0) {
					configFile.config[i].characters[y].result = initRoll;					
					message = user + " rolled a " + initRoll + " for " + configFile.config[i].characters[y].name;
				}
			}
			return user + " you already rolled, no take-backs.";
		}
	}
	if (message == "") {
		return user + " you're not even playing, go away.";
	}	
	
	var doneMessage = checkDone();
	if (doneMessage == "") {
		isRolling = false;
		doneMessage = showInitiative();
	}
	return message + "\n" + doneMessage;
}

// Get a random number between 1 and 20 inclusive
function getRandomRoll() {
  return Math.floor(Math.random() * 20) + 1;
}
