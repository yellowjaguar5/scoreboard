var App = Ember.Application.create();

App.Router.map(function() {
	this.route("bracketCreation", {path: "/create-bracket"});
	this.resource("bracket", {path: "/"}, function() {
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
	nextRoundMatchSpot: DS.attr("string"),
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

App.ApplicationRoute = Ember.Route.extend({
	beforeModel: function() {
		this.transitionTo("bracketCreation");
	}
});

App.BracketCreationRoute = Ember.Route.extend({
	actions: {
		createBracket: function() {
			var self = this;
			var numRounds = this.controller.get("numRounds");

			//TODO figure out better structure for bracket generation
			self.controller.buildBracket(numRounds)
			.then(function() {
				self.controllerFor("bracket").set("numRounds", numRounds);

				$("#bracket-creation-modal").modal("hide").on("hidden.bs.modal", function() {
					//goes to the first round
					self.transitionTo("round", 1);
				});
			});
		}
	}
});

App.BracketCreationView = Ember.View.extend({
	didInsertElement: function() {
		$("#bracket-creation-modal").modal("show");
	}
});

App.BracketCreationController = Ember.Controller.extend({
	buildBracket: function(numRounds) {
		var store = this.store;

		var generateBracket = function(currRound, nextRoundMatch, nextRoundMatchSpot) {
			return new Ember.RSVP.Promise(function(resolve, reject) {
				if (currRound <= 0) {
					resolve();
				} else {
					new Ember.RSVP.Promise(function(resolve, reject) {
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
							nextRoundMatchSpot: nextRoundMatchSpot,
							firstTeamScore: 0,
							secondTeamScore: 0,
							finalized: false
						});

						currRoundObj.get("matches").pushObject(newMatch);

						Ember.RSVP.all([generateBracket(currRound - 1, newMatch, "first"),
										generateBracket(currRound - 1, newMatch, "second")]).then(resolve);
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
			return new Ember.RSVP.Promise(function(resolve, reject) {
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

		return new Ember.RSVP.Promise(function(resolve, reject) {
			generateBracket(numRounds, null)
			.then(populateBracket)
			.then(resolve);
		});
	}
});

App.BracketRoute = Ember.Route.extend();

App.BracketController = Ember.Controller.extend({
	needs: "currentRound",
	_currentRound: Ember.computed.alias("controllers.currentRound"),
	currentRound: function() {
		return Number(this.get("_currentRound.id"));
	}.property("_currentRound.id"),
	nextRound: function() {
		return this.get("currentRound") + 1;
	}.property("currentRound"),
	previousRound: function() {
		return this.get("currentRound") - 1;
	}.property("currentRound"),
	isFirstRound: function() {
		return this.get("currentRound") == 1;
	}.property("currentRound"),
	isSecondToLastRound: function() {
		return this.get("currentRound") + 1 == this.get("numRounds");
	}.property("currentRound"),
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
	afterModel: function(round, transition) {
		if (round.get("id") >= this.controllerFor("bracket").get("numRounds"))
			this.transitionTo("round", round.get("id") - 1);
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
		}, function(err) {
			self.controllerFor("nextRound").set("model", null);
		});
	},
	actions: {
		play: function(match) {
			if (match.get("firstTeam") && match.get("secondTeam"))
				this.transitionTo("match", match);
		}
	}
});

App.CurrentRoundController = Ember.ObjectController.extend();
App.NextRoundController = Ember.ObjectController.extend();

App.BracketMatchController = Ember.ObjectController.extend({
	isFirstRound: function() {
		return this.get("round.id") == 1;
	}.property("round.id"),
	firstTeamWon: function() {
		return this.get("finalized") && (this.get("winner") === this.get("firstTeam"));
	}.property("finalized", "winner"),
	secondTeamWon: function() {
		return this.get("finalized") && (this.get("winner") === this.get("secondTeam"));
	}.property("finalized", "winner"),
	editing: 2,
	editingFirstTeamName: function() {
		return this.get("editing") == 0;
	}.property("editing"),
	editingSecondTeamName: function() {
		return this.get("editing") == 1;
	}.property("editing"),
	actions: {
		toggleEditing: function(teamEnum) {
			this.set("editing", teamEnum);
		}
	}
});

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
	scoreIsZero: function(team) {
		return this.get(team + "TeamScore") == 0;
	},
	finalizedOrFirstTeamScoreIsZero: function() {
		return this.scoreIsZero("first") || this.get("finalized");
	}.property("firstTeamScore", "finalized"),
	finalizedOrSecondTeamScoreIsZero: function() {
		return this.scoreIsZero("second") || this.get("finalized");
	}.property("secondTeamScore", "finalized"),
	finalizedOrTie: function() {
		return this.get("finalized") || this.get("winner") === null;
	}.property("winner", "finalized"),
	actions: {
		//better way of specifying team
		incrementScore: function(teamEnum) {
			var team = teamEnum == 0 ? "firstTeam" : "secondTeam";
			this.incrementProperty(team + "Score");
		},
		decrementScore: function(teamEnum) {
			var team = teamEnum == 0 ? "firstTeam" : "secondTeam";
			this.decrementProperty(team + "Score");
		},
		finalize: function(finalizedMatchId) {
			this.set("finalized", true);

			//TODO make better way of placing team in next round
			//(maybe based on match id being odd or even?)
			this.get("nextRoundMatch").set(this.get("nextRoundMatchSpot") + "Team", this.get("winner"));
		}
	}
});