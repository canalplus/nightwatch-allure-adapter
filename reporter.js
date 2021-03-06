//FIXME Code cleanup needed
//FIXME two separate modules, one for parsing results and testfile and second for actually generating results
//FIXME Errors in test files can not be detected
//TODO Errors if command names or functions are not present are displayed anyhow,they can be used
//TODO screenshots FTW
var Allure = require("allure-js-commons");
var allureReporter = new Allure();
var Runtime = require("allure-js-commons/runtime");
var fs = require("fs");
var path = require("path");
var cp = require("comment-parser");
var _ = require('lodash');
var runtimeAllure = new Runtime(allureReporter);
var find = require("find");

var self = module.exports = {
    write: function (results, done, directoryPath, reportPath) {
        allureReporter.setOptions(" -o reports/allure-report" || {});
        for (var currentModule in results.modules) {
            module = results.modules[currentModule];
            var currentTest = {
                failures: self.parse(module.failures),
                errors: self.parse(module.errors),
                skipped: self.parse(module.skipped.length),
                tests: self.parse(module.tests),
                isFailure: false,
                isSkipped: false,
                suiteName: module.group,
                testName: currentModule,
                testSteps: [],
                errorMessage: "",
                startTimestamp: self.parseDate(module.timestamp),
                endTimestamp: self.parseDate(module.timestamp),
                tags: {}
            }

            if (typeof directoryPath !== 'undefined') {
                if (typeof reportPath !== 'undefined') {
                    allureReporter.setOptions({targetDir: path.join(directoryPath, reportPath)});
                }
                currentTest.tags = self.parseFileForTags(directoryPath + "/tests/" + currentModule + ".js");
            }

            if (currentTest.skipped === currentTest.tests) {
                currentTest.isSkipped = true;
            } else if (currentTest.failures > 0 || currentTest.errors > 0) {
                currentTest.isFailure = true;
            }
            var testPath = currentTest.testName.split("/");

            if (currentTest.suiteName === undefined) {
                currentTest.suiteName = testPath[testPath.length - 2];
            }
            if (currentTest.suiteName === "") {
                currentTest.suiteName = "Default Suite"
            }
            if (results.hasOwnProperty("environment")) {
                currentTest.suiteName = currentTest.suiteName + "-" + results.environment;
            }
            if (testPath.length > 1) {
                currentTest.testName = testPath[testPath.length - 1];
            }

            allureReporter.startSuite(currentTest.suiteName, currentTest.startTimestamp);
            allureReporter.startCase(currentTest.testName, currentTest.startTimestamp);
            //TODO considering good number of properties switch should be used
            if (currentTest.tags.hasOwnProperty("testcaseId")) {
                runtimeAllure.addLabel("testId", currentTest.tags["testcaseId"])
            }
            if (currentTest.tags.hasOwnProperty("issue")) {
                runtimeAllure.addLabel("issue", currentTest.tags["issue"])
            }
            if (currentTest.tags.hasOwnProperty("severity")) {
                runtimeAllure.addLabel("severity", currentTest.tags["severity"])
            }
            if (currentTest.tags.hasOwnProperty("feature")) {
                runtimeAllure.addLabel("feature", currentTest.tags["feature"])
            }
            if (currentTest.tags.hasOwnProperty("story")) {
                runtimeAllure.addLabel("story", currentTest.tags["story"])
            }
            if (currentTest.tags.hasOwnProperty("owner")) {
                runtimeAllure.addLabel("owner", currentTest.tags["owner"])
            }
            if (currentTest.tags.hasOwnProperty("description")) {
                runtimeAllure.description(currentTest.tags.description);
            }
            allureReporter.addAttachment("Reported Result", JSON.stringify(results), "application/json");
            var previousStepTimestamp = currentTest.startTimestamp;

            for (var completedStep in module.completed) {
                var currentStep = module.completed[completedStep];

                var curCompletedStep = {
                    failures: self.parse(currentStep.failed),
                    errors: self.parse(currentStep.errors),
                    skipped: self.parse(currentStep.skipped),
                    passed: self.parse(currentStep.passed),
                    startTimestamp: previousStepTimestamp,
                    endTimestamp: previousStepTimestamp + (self.parseFloat(currentStep.time) * 1000),
                    totalTime: self.parseFloat(currentStep.time) * 1000
                }
                currentTest.endTimestamp = currentTest.endTimestamp + curCompletedStep.totalTime;
                previousStepTimestamp = curCompletedStep.endTimestamp;
                allureReporter.startStep(completedStep, curCompletedStep.startTimestamp);
                for (assertion in  currentStep.assertions) {
                    allureReporter.startStep(currentStep.assertions[assertion].message, curCompletedStep.startTimestamp);
                    allureReporter.endStep("passed", curCompletedStep.endTimestamp);
                }
                if (curCompletedStep.failures > 0 || curCompletedStep.errors > 0) {
                    allureReporter.endStep("failed", curCompletedStep.endTimestamp);
                    for (var assertion in currentStep.assertions) {
                        var currentAssertion = currentStep.assertions[assertion];
                        if (currentAssertion.failure != false) {
                            var errorMessage = {
                                failure: currentAssertion.failure,
                                message: currentAssertion.message,
                                stacktrace: currentAssertion.stacktrace
                            }
                            currentTest.errorMessage = {
                                message: errorMessage.failure + errorMessage.message,
                                stack: errorMessage.message + "\n" + errorMessage.failure + "\n" + errorMessage.stacktrace
                            }
                        }
                    }
                } else {
                    allureReporter.endStep("passed", curCompletedStep.endTimestamp);
                }

            }

            for (var skippedStep in module.skipped) {
                allureReporter.startStep(module.skipped[skippedStep], currentTest.endTimestamp);
                allureReporter.endStep("skipped", currentTest.endTimestamp);
            }

            if (currentTest.isFailure) {
                if (typeof directoryPath !== 'undefined') {
                    find.file(/\.png$/, directoryPath + "/screenshots/" + results.environment + "/" + currentModule, function (files) {
                        files.forEach(function (file) {
                            fs.readFile(file, function (err, data) {
                                allureReporter.addAttachment("screenshots", data, "image/png");
                                allureReporter.endCase("failed", currentTest.errorMessage, currentTest.endTimestamp);
                                allureReporter.endSuite(currentTest.endTimestamp);
                            });
                        });
                    });
                } else {
                    allureReporter.endCase("failed", currentTest.errorMessage, currentTest.endTimestamp);
                    allureReporter.endSuite(currentTest.endTimestamp);
                }

            } else if (currentTest.isSkipped) {
                allureReporter.endCase("skipped", "No Steps Performed", currentTest.endTimestamp);
                allureReporter.endSuite(currentTest.endTimestamp);
            }

            else {
                allureReporter.endCase("passed", "", currentTest.endTimestamp);
                allureReporter.endSuite(currentTest.endTimestamp);
            }

        }
        done();
    },
    parse: function (str) {
        return _.isNaN(str) ? 0 : parseInt(str, 10);
    },
    parseFloat: function (str) {
        return _.isNaN(str) ? 0 : parseFloat(str);
    },
    parseDate: function (str) {
        return Date.parse(str);
    },
    //FIXME file paths are incorrect, hence can not use this
    parseFileForTags: function (testfilePath) {
        var opts = {
            parsers: [
                cp.PARSERS.parse_tag,
                cp.PARSERS.parse_description,
            ]
        };

        var file = fs.readFileSync(testfilePath, 'utf-8');
        var parsedInformation = cp(file, opts);
        var tcTags = {};
        if (parsedInformation.length > 0) {
            tcTags.description = parsedInformation[0].description;
            var tagsInTest = parsedInformation[0].tags;
            for (var tag in tagsInTest) {
                currentTag = tagsInTest[tag];
                switch (currentTag.tag) {
                    case "testcaseid":
                        tcTags.testcaseId = currentTag.description;
                        break;
                    case "issue":
                        tcTags.issue = currentTag.description;
                        break;
                    case "severity":
                        tcTags.severity = currentTag.description;
                        break;
                    case "feature":
                        tcTags.feature = currentTag.description;
                        break;
                    case "story":
                        tcTags.story = currentTag.description;
                        break;
                    case "owner":
                        tcTags.owner = currentTag.description;
                        break;
                    case "type":
                        tcTags.type = currentTag.description;
                        break;
                    case "testtype":
                        tcTags.testType = currentTag.description;
                        break;
                }
            }
        }
        return tcTags;
    }
};
