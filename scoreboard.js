var App = Ember.Application.create();

App.Team = DS.Model.extend({
	name: DS.attr("string")
});

App.Match = DS.Model.extend({
	round: DS.belongsTo("round"),
	nextRoundMatch: DS.belongsTo("match"),
	nextRoundMatchSpot: DS.attr("string"),
	firstTeam: DS.belongsTo("matchTeamContext"),
	secondTeam: DS.belongsTo("matchTeamContext"),
	winner: function() {
		if (this.get("firstTeam.score") > this.get("secondTeam.score"))
			return this.get("firstTeam.team");
		else if (this.get("secondTeam.score") > this.get("firstTeam.score"))
			return this.get("secondTeam.team");
		else
			return null;
	}.property("firstTeam.score", "secondTeam.score"),
	finalized: DS.attr("boolean")
});

App.MatchTeamContext = DS.Model.extend({
	match: DS.belongsTo("match"),
	team: DS.belongsTo("team"),
	score: DS.attr("number")
});

App.Round = DS.Model.extend({
	matches: DS.hasMany("match")
});

App.Router.map(function() {
	this.route("bracketCreation", {path: "/create-bracket"});
	this.resource("bracket", {path: "/matches"}, function() {
		this.resource("match", {path: "/matches/:match_id"});
	});
});

App.ApplicationRoute = Ember.Route.extend({
	beforeModel: function() {
		this.transitionTo("bracketCreation");
	}
});

App.ApplicationView = Ember.View.extend({
	classNames: ["container"]
});

App.BracketCreationRoute = Ember.Route.extend({
	actions: {
		createBracket: function() {
			var self = this;
			//TODO add form validation
			var bracketName = this.controller.get("bracketName");
			var numRounds = this.controller.get("numRounds");

			var isBonusRound = this.controller.get("bonusRound");
			var bonusRoundTeam = null;

			if (isBonusRound)
				bonusRoundTeam = this.controller.get("bonusTeamName");

			//TODO figure out better structure for bracket generation code
			self.controller.buildBracket(numRounds, bonusRoundTeam)
			.then(function() {
				self.controllerFor("bracket").set("numRounds", isBonusRound ? 
																numRounds + 1 : 
																numRounds);
				self.controllerFor("bracket").set("name", bracketName);

				$("#bracket-creation-modal").modal("hide").on("hidden.bs.modal", function() {
					self.transitionTo("bracket");
				});
			});
		}
	}
});

App.BracketCreationController = Ember.Controller.extend({
	numTeams: function() {
		if (false)
			return 0;

		return Math.pow(2, Number(this.get("numRounds")));
	}.property("numRounds"),
	numRounds: function() {
		if (this.get("numRoundsInput") === "")
			return NaN;
		
		return Number(this.get("numRoundsInput"));
	}.property("numRoundsInput"),
	invalidBracketName: function() {
		return !this.get("bracketName") || this.get("bracketName") === "";
	}.property("bracketName"),
	invalidNumRounds: function() {
		console.log(this.get("numRounds"));
		return isNaN(this.get("numRounds"));
	}.property("numRounds"),
	invalidForm: function() {
		return this.get("invalidBracketName") || this.get("invalidNumRounds");
	}.property("invalidBracketName", "numRounds"),
	buildBracket: function(numRounds, bonusRoundTeam) {
		var store = this.store;

		var createMatchTeamContext = function(matchId, team, score) {
			return store.push("matchTeamContext", {
				//TODO better id generation
				id: matchId + team,
				match: matchId,
				score: score
			});
		}

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
						//TODO better id generation
						var newMatchId = String(Math.round(Math.random()*100000));

						var newMatch = store.push("match", {
							id: newMatchId,
							round: currRoundObj,
							firstTeam: createMatchTeamContext(newMatchId, 1, 0),
							secondTeam: createMatchTeamContext(newMatchId, 2, 0),
							nextRoundMatch: nextRoundMatch,
							nextRoundMatchSpot: nextRoundMatchSpot,
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
						match.set("firstTeam.team", createTeam(++numMatches));
						match.set("secondTeam.team", createTeam(++numMatches));
					});

					resolve();
				});
			});
		};

		return new Ember.RSVP.Promise(function(resolve, reject) {
			generateBracket(numRounds, null)
			.then(function(generatedBracket) {
				if (bonusRoundTeam) {
					store.find("round", numRounds)
					.then(function(finalRoundObj) {
						var bonusRound = store.push("round", {
							id: "bonus"
						});

						var bonusMatch = store.push("match", {
							id: "bonus",
							round: bonusRound,
							firstTeam: createMatchTeamContext("bonus", 1, 0),
							secondTeam: createMatchTeamContext("bonus", 2, 0),
							finalized: false
						});

						bonusRound.get("matches").pushObject(bonusMatch);

						bonusMatch.set("firstTeam.team", store.push("team", {
							id: "bonus",
							name: bonusRoundTeam
						}));

						finalRoundObj.set("nextRoundMatch", bonusMatch);
						finalRoundObj.set("nextRoundMatchSpot", "second");
					});
				}

				return populateBracket();
			})
			.then(resolve);
		});
	}
});

App.BracketCreationView = Ember.View.extend({
	didInsertElement: function() {
		$("#bracket-creation-modal").modal("show");
	}
});

App.BracketRoute = Ember.Route.extend({
	renderTemplate: function() {
		this.render("bracket", {
			into: "application"
		});
	},
	model: function() {
		//TODO find out why is this not this.store.find...
		return this.store.all("round");
	},
	setupController: function(controller, model) {
		controller.set("content", model);
	},
	actions: {
		play: function(match) {
			if (match.get("firstTeam.team") && match.get("secondTeam.team")) {
				this.set("controller.currentMatch", match.get("id"));
				this.transitionTo("match", match);
			}
		}
	}
});

App.BracketController = Ember.ArrayController.extend({
	sortProperties: ["id"],
	sortAscending: true,
	currentRound: 1,
	currentMatch: null,
	isFirstRound: function() {
		return this.get("currentRound") <= 1;
	}.property("currentRound", "numRounds"),
	isSecondToLastRound: function() {
		return this.get("currentRound") >= this.get("numRounds") - 1;
	}.property("currentRound", "numRounds"),
	actions: {
		nextRound: function() {
			this.incrementProperty("currentRound");
		},
		previousRound: function() {
			this.decrementProperty("currentRound");
		}
	}
});

App.BracketView = Ember.View.extend({
	currentOffset: 0,
	roundWidth: 0,
	didInsertElement: function() {
		var self = this;

		self.set("roundWidth", $(".round").outerWidth());

		$(window).on("load resize orientationchange", function() {
			self.set("roundWidth", $(".round").outerWidth());
			self.get("setCurrentRound")(false, self);
		});
	},
	setCurrentRound: function(animate, self) {
		var bracket = $("#bracket"),
			newRoundId = self.get("controller").get("currentRound"),
			//TODO investigate off-by-4 pixels bug that is currently compensated for by the +4
			newOffset = -((newRoundId - 1) * (self.get("roundWidth") + 4))
			;

		self.set("currentOffset", newOffset);

		if (animate) {
			bracket.addClass("animate");

			if (Modernizr.csstransforms3d) {
				//TODO add all browser transforms...
            	bracket.css("transform", "translate3d("+ self.get("currentOffset") +"px,0,0) scale3d(1,1,1)");
	        } else if (Modernizr.csstransforms) {
	            bracket.css("transform", "translate("+ self.get("currentOffset") +"px,0)");
	        } else {
	        	bracket.animate({left: self.get("currentOffset")});
	        }
		} else {
			bracket.css("left", self.get("currentOffset"));
		}
	},
	actions: {
		nextRound: function() {
			this.get("controller").send("nextRound");
			this.get("setCurrentRound")(true, this);
		},
		previousRound: function() {
			this.get("controller").send("previousRound");
			this.get("setCurrentRound")(true, this);
		}
	}
});

App.RoundController = Ember.ObjectController.extend({
	isBonusRound: function() {
		return this.get("id") === "bonus";
	}.property("id")
});

App.BracketMatchController = Ember.ObjectController.extend({
	needs: "bracket",
	isFirstRound: function() {
		return this.get("round.id") == 1;
	}.property("round.id"),
	isActive: function() {
		return this.get("controllers.bracket.currentMatch") === this.get("id");
	}.property("controllers.bracket.currentMatch")
});

App.BracketMatchView = Ember.View.extend({
	classNames: ["row", "bracket-match"],
	classNameBindings: ["isActive:active"],
	isActive: function() {
		return this.get("controller.isActive");
	}.property("controller.isActive")
});

App.BracketMatchTeamController = Ember.ObjectController.extend({
	isFirstRound: function() {
		return this.get("match.round.id") == 1;
	}.property("match.round.id"),
	teamWon: function() {
		return this.get("match.finalized") && this.get("match.winner.id") === this.get("team.id");
	}.property("match.winner", "match.finalized"),
	editing: false,
	actions: {
		toggleEditing: function() {
			this.set("editing", !this.get("editing"));
		}
	}
});

App.BracketMatchTeamView = Ember.View.extend({
	tagName: "li",
	classNames: ["list-group-item"],
	classNameBindings: ["teamWon:list-group-item-success"],
	teamWon: function() {
		return this.get("controller.teamWon");
	}.property("controller.teamWon")
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
	finalizedOrTie: function() {
		return this.get("finalized") || this.get("winner") === null;
	}.property("winner", "finalized"),
	actions: {
		finalize: function() {
			this.set("finalized", true);

			//TODO make better way of placing team in next round
			//(maybe based on match id being odd or even?)
			this.get("nextRoundMatch").set(this.get("nextRoundMatchSpot") + "Team.team", this.get("winner"));
		}
	}
});

App.MatchTeamController = Ember.ObjectController.extend({
	needs: "match",
	finalized: function() {
		return this.get("controllers.match.finalized");
	}.property("controllers.match.finalized"),
	finalizedOrScoreIsZero: function() {
		console.log(this.get("score") === 0);
		return this.get("score") === 0 || this.get("finalized");
	}.property("score", "finalized"),
	actions: {
		incrementScore: function() {
			this.incrementProperty("score");
		},
		decrementScore: function() {
			this.decrementProperty("score");
		}
	}
});