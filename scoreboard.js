var App = Ember.Application.create();

App.Router.map(function() {
	this.route("bracketCreation", {path: "/create-bracket"});
	this.resource("bracket", {path: "/bracket"}, function() {
		this.resource("round", {path: "/round/:round_id"}, function() {
			this.resource("match", {path: "/match/:match_id"});
		});
	});
});

//App.ApplicationAdapter = DS.FixtureAdapter.extend();

App.Team = DS.Model.extend({
	name: DS.attr("string")
});

App.Match = DS.Model.extend({
	round: DS.belongsTo("round"),
	nextRoundMatch: DS.belongsTo("match"),
	firstTeam: DS.belongsTo("team"),
	firstTeamScore: DS.attr("number"),
	secondTeam: DS.belongsTo("team"),
	secondTeamScore: DS.attr("number"),
	winner: function() {
		if (this.get("firstTeamScore") > this.get("secondTeamScore"))
			return this.get("firstTeam");
		else if (this.get("secondTeamScore") > this.get("firstTeamScore"))
			return this.get("secondTeam");
		else
			return null;
	}.property("firstTeamScore", "secondTeamScore"),
	finalized: DS.attr("boolean")
});

App.Round = DS.Model.extend({
	matches: DS.hasMany("match")
});

App.ApplicationRoute = Ember.Route.extend({});

App.BracketCreationRoute = Ember.Route.extend({
	renderTemplate: function() {
		this.render("bracketCreation", {
			outlet: "bracketCreation"
		});
	},
	actions: {
		createBracket: function(numRounds) {
			var self = this;

			//TODO figure out better structure for bracket generation
			self.controller.buildBracket(numRounds)
			.then(function() {
				//goes to the first round
				self.transitionTo("round", 1);
			});
		}
	}
});

App.BracketCreationController = Ember.Controller.extend({
	buildBracket: function(numRounds) {
		var store = this.store;

		var generateBracket = function(currRound, nextRoundMatch) {
			return new Promise(function(resolve, reject) {
				if (currRound <= 0) {
					resolve();
				} else {
					new Promise(function(resolve, reject) {
						store.find("round", currRound)
							.then(function(currRoundObj) {
								resolve(currRoundObj);
							}, function(err) {
								var newRound = store.push("round", {
									id: currRound
								});

								resolve(newRound);
							});
					})
					.then(function(currRoundObj) {
						var newMatch = store.push("match", {
							//TODO fix id-generation
							id: Math.round(Math.random()*1000),
							round: currRoundObj,
							nextRoundMatch: nextRoundMatch,
							firstTeamScore: 0,
							secondTeamScore: 0,
							finalized: false
						});

						currRoundObj.get("matches").pushObject(newMatch);

						Ember.RSVP.all([generateBracket(currRound - 1, newMatch),
										generateBracket(currRound - 1, newMatch)]).then(resolve);
					});
				}
			});
		};

		var createTeam = function(id) {
			return store.push("team", {
				id: id,
				//TODO remove automatic name generation
				name: "Team " + id
			});
		};

		var populateBracket = function() {
			return new Promise(function(resolve, reject) {
				store.find("round", 1)
				.then(function(firstRound) {
					var numMatches = 0;

					firstRound.get("matches").forEach(function(match) {
						match.set("firstTeam", createTeam(++numMatches));
						match.set("secondTeam", createTeam(++numMatches));
					});

					resolve();
				});
			});
		};

		return new Promise(function(resolve, reject) {
			generateBracket(numRounds, null)
			.then(populateBracket)
			.then(resolve);
		});
	}
});

App.BracketRoute = Ember.Route.extend({
	renderTemplate: function() {
		this.render("bracket", {
			outlet: "bracket"
		});
	}
});

App.RoundRoute = Ember.Route.extend({
	renderTemplate: function() {
		this.render("round", {
			into: "bracket",
			outlet: "currentRound",
			controller: "currentRound"
		});

		this.render("round", {
			into: "bracket",
			outlet: "nextRound",
			controller: "nextRound"
		});
	},
	model: function(params) {
		return this.store.find("round", params.round_id);
	},
	setupController: function(controller, currentRound) {
		var self = this;

		self.controllerFor("currentRound").set("model", currentRound);

		//Loads the next round as the nextRound controller's model
		self.store.find("round", Number(currentRound.get("id")) + 1)
		.then(function(nextRound) {
			self.controllerFor("nextRound").set("model", nextRound);
		});
	}
});

App.CurrentRoundController = Ember.ObjectController.extend();
App.NextRoundController = Ember.ObjectController.extend();

App.MatchRoute = Ember.Route.extend({
	renderTemplate: function() {
		this.render("match", {
			outlet: "match"
		});
	},
	model: function(params) {
		return this.store.find("match", params.match_id);
	}
});

App.MatchController = Ember.ObjectController.extend({
	actions: {
		incrementScore: function(team) {
			if (team === 0)
				this.incrementProperty("firstTeamScore");
			else if (team === 1)
				this.incrementProperty("secondTeamScore");
		},
		decrementScore: function(team) {

		},
		finalize: function(finalizedMatchId) {
			this.set("finalized", true);

			var nextRoundMatch = this.get("nextRoundMatch");
			if (!nextRoundMatch.get("firstTeam"))
				nextRoundMatch.set("firstTeam", this.get("winner"));
			else if (!nextRoundMatch.get("secondTeam"))
				nextRoundMatch.set("secondTeam", this.get("winner"));
		}
	}
});