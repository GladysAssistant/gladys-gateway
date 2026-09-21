const { normalizeLanguage } = require('./language');
const { extractFirstname } = require('./billing-email-scope');

const ONE_MINUTE_IN_MS = 60 * 1000;

/**
 * Human readable duration ("2 h 15 min", "3 jours 4 h"): the two most significant units
 * only, a user does not care about the minutes of a three days outage.
 */
function formatDuration(durationInMinutes, language) {
  const isFr = normalizeLanguage(language) === 'fr';
  const totalMinutes = Math.max(0, Math.floor(durationInMinutes));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) {
    parts.push(isFr ? `${days} jour${days > 1 ? 's' : ''}` : `${days} day${days > 1 ? 's' : ''}`);
  }
  if (hours > 0) {
    parts.push(`${hours} h`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} min`);
  }
  return parts.slice(0, 2).join(' ');
}

/**
 * Date and time of an event. The gateway does not know the timezone of the user: the time
 * is given in UTC and says so, so a wrong reading is not possible.
 */
function formatDateTime(date, language) {
  if (!date) {
    return '';
  }
  const locale = normalizeLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  const formatted = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(date));
  return `${formatted} UTC`;
}

function minutesBetween(from, to) {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / ONE_MINUTE_IN_MS);
}

/**
 * Email sent by the instance watchdog when the Gladys instance of the user has not been
 * seen by the gateway for longer than the delay chosen by the user (delayInMinutes).
 */
function buildInstanceOfflineScope({ instance, user, lastSeenAt, delayInMinutes, now = new Date(), language }) {
  const normalizedLanguage = normalizeLanguage(language);
  return {
    firstname: extractFirstname(user?.name),
    instanceName: instance.name,
    offlineFor: formatDuration(minutesBetween(lastSeenAt, now), normalizedLanguage),
    lastSeenDate: formatDateTime(lastSeenAt, normalizedLanguage),
    alertDelay: formatDuration(delayInMinutes, normalizedLanguage),
  };
}

/**
 * Email sent by the instance watchdog once the instance is connected again, to close the
 * outage reported by the "instance offline" email.
 */
function buildInstanceBackOnlineScope({ instance, user, lastSeenAt, now = new Date(), language }) {
  const normalizedLanguage = normalizeLanguage(language);
  return {
    firstname: extractFirstname(user?.name),
    instanceName: instance.name,
    downtime: formatDuration(minutesBetween(lastSeenAt, now), normalizedLanguage),
    lastSeenDate: formatDateTime(lastSeenAt, normalizedLanguage),
  };
}

module.exports = {
  buildInstanceBackOnlineScope,
  buildInstanceOfflineScope,
  formatDateTime,
  formatDuration,
  minutesBetween,
};
