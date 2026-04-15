/**
* BACKEND & SYNC ENGINE
* ==========================================
*/

function doGet() {
return HtmlService.createHtmlOutputFromFile('Index')
.setTitle('Calendar Sync Settings')
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
.addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getAvailableCalendars() {
return CalendarApp.getAllCalendars().map(c => ({ id: c.getId(), name: c.getName() }));
}

function getSettings() {
const props = PropertiesService.getUserProperties();
return {
jobs: props.getProperty('SYNC_JOBS_CONFIG') ? JSON.parse(props.getProperty('SYNC_JOBS_CONFIG')) : [],
frequency: parseInt(props.getProperty('SYNC_FREQUENCY') || "0", 10)
};
}

/**
* Saves settings and triggers an immediate sync + updates schedule.
*/
function saveSettings(jobs, frequency) {
const props = PropertiesService.getUserProperties();
props.setProperty('SYNC_JOBS_CONFIG', JSON.stringify(jobs));
props.setProperty('SYNC_FREQUENCY', frequency.toString());

// 1. Update the background schedule
manageTrigger(frequency);

// 2. Trigger an immediate sync so the user sees results right away
syncAllCalendars();

return true;
}

function manageTrigger(frequency) {
const triggers = ScriptApp.getProjectTriggers();
triggers.forEach(t => { if (t.getHandlerFunction() === 'syncAllCalendars') ScriptApp.deleteTrigger(t); });

if (frequency > 0) {
const builder = ScriptApp.newTrigger('syncAllCalendars').timeBased();
if (frequency < 60) builder.everyMinutes(frequency);
else if (frequency < 1440) builder.everyHours(frequency / 60);
else builder.everyDays(1);
builder.create();
}
}

function syncAllCalendars() {
const settings = getSettings();
if (!settings.jobs.length) return;

settings.jobs.forEach(job => {
const destCal = CalendarApp.getCalendarById(job.DESTINATION_CALENDAR_ID);
if (!destCal) return;
const now = new Date();
const future = new Date(now.getTime() + job.SYNC_DAYS * 24 * 60 * 60 * 1000);
syncSources(job, destCal, now, future);
});
}

function syncSources(job, destCal, start, end) {
const existingEventsMap = getManagedEventsMap(job, destCal, start, end);
job.SOURCES.forEach(sourceConfig => processSourceToDestination(job, sourceConfig, destCal, existingEventsMap, start, end));
cleanupOrphanedEvents(existingEventsMap);
}

function processSourceToDestination(job, sourceConfig, destCal, existingEventsMap, start, end) {
const sourceCal = CalendarApp.getCalendarById(sourceConfig.id);
if (!sourceCal) return;

sourceCal.getEvents(start, end).forEach(sourceEvent => {
if (sourceEvent.getDescription().includes(job.SYNC_TAG)) return;
if (sourceConfig.skipFreeEvents && sourceEvent.getTransparency() === CalendarApp.EventTransparency.TRANSPARENT) return;

const eventKey = `${sourceEvent.getStartTime().getTime()}-${sourceEvent.getId()}`;
const existingEvent = existingEventsMap.get(eventKey);

const data = prepareEventData(sourceConfig, sourceEvent, job.SYNC_TAG);

if (existingEvent) {
existingEventsMap.delete(eventKey);
updateEvent(existingEvent, sourceEvent, data, sourceConfig.color);
} else {
createEvent(destCal, sourceEvent, data, sourceConfig.color);
}
});
}

function prepareEventData(config, event, tag) {
let title = event.getTitle();
let desc = event.getDescription();
let loc = event.getLocation();
let visibility = CalendarApp.Visibility.DEFAULT;
let transparency = config.transparencyOverride === "busy" ? CalendarApp.EventTransparency.OPAQUE :
(config.transparencyOverride === "free" ? CalendarApp.EventTransparency.TRANSPARENT : event.getTransparency());

if (config.syncMode === 'private') {
visibility = CalendarApp.Visibility.PRIVATE;
} else if (config.syncMode === 'custom') {
if (config.titleMode === 'prefix') title = config.titleContent + title;
if (config.titleMode === 'replace') title = config.titleContent;
if (config.stripDescription) desc = "";
if (config.stripLocation) loc = "";
}

return {
title: title,
description: `${tag} ${event.getId()}${desc ? "\n\n" + desc : ""}`,
location: loc,
visibility: visibility,
transparency: transparency,
stripAttachments: (config.syncMode === 'custom' && config.stripAttachments) || config.syncMode === 'private'
};
}

function createEvent(calendar, sourceEvent, data, colorId) {
const options = { description: data.description, location: data.location, sendInvites: false };
let newEvent = sourceEvent.isAllDayEvent() ?
calendar.createAllDayEvent(data.title, sourceEvent.getStartTime(), options) :
calendar.createEvent(data.title, sourceEvent.getStartTime(), sourceEvent.getEndTime(), options);

newEvent.setVisibility(data.visibility);
newEvent.setTransparency(data.transparency);
if (colorId && data.visibility !== CalendarApp.Visibility.PRIVATE) newEvent.setColor(colorId.toString());
if (data.stripAttachments) {
try { newEvent.getAttachments().forEach(a => newEvent.removeAttachment(a)); } catch(e) {}
}
}

function updateEvent(destEvent, sourceEvent, data, colorId) {
let changed = false;
if (destEvent.getTitle() !== data.title) { destEvent.setTitle(data.title); changed = true; }
if (destEvent.getDescription() !== data.description) { destEvent.setDescription(data.description); changed = true; }
if (destEvent.getLocation() !== data.location) { destEvent.setLocation(data.location); changed = true; }
if (destEvent.getVisibility() !== data.visibility) { destEvent.setVisibility(data.visibility); changed = true; }
if (destEvent.getTransparency() !== data.transparency) { destEvent.setTransparency(data.transparency); changed = true; }

if (sourceEvent.isAllDayEvent()) {
if (!destEvent.isAllDayEvent() || destEvent.getAllDayStartDate().toDateString() !== sourceEvent.getAllDayStartDate().toDateString()) {
destEvent.setAllDayDate(sourceEvent.getStartTime());
changed = true;
}
} else {
if (destEvent.isAllDayEvent() || destEvent.getStartTime().getTime() !== sourceEvent.getStartTime().getTime() || destEvent.getEndTime().getTime() !== sourceEvent.getEndTime().getTime()) {
destEvent.setTime(sourceEvent.getStartTime(), sourceEvent.getEndTime());
changed = true;
}
}

if (colorId && data.visibility !== CalendarApp.Visibility.PRIVATE && destEvent.getColor() !== colorId.toString()) {
destEvent.setColor(colorId.toString());
changed = true;
}

if (data.stripAttachments) {
try { destEvent.getAttachments().forEach(a => destEvent.removeAttachment(a)); } catch(e) {}
}
}

function getManagedEventsMap(job, calendar, start, end) {
const map = new Map();
const regex = new RegExp(`${job.SYNC_TAG}\\s*([\\w.@-]+)`);
calendar.getEvents(start, end).forEach(e => {
const m = e.getDescription().match(regex);
if (m) map.set(`${e.getStartTime().getTime()}-${m[1]}`, e);
});
return map;
}

function cleanupOrphanedEvents(map) {
map.forEach(e => { try { e.deleteEvent(); } catch(err) {} });
}

function clearAllDestinationCalendars() {
const jobs = getSettings().jobs;
jobs.forEach(job => {
const cal = CalendarApp.getCalendarById(job.DESTINATION_CALENDAR_ID);
if (cal) cal.getEvents(new Date("2000-01-01"), new Date("2100-01-01")).forEach(e => e.deleteEvent());
});
}