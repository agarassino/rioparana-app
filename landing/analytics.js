// PostHog — product analytics for the Paraná Info landing.
// NOTE: if your PostHog project lives on EU cloud, change `api_host` below to
// 'https://eu.i.posthog.com'. US cloud is the default assumed here.
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('phc_qFzHQpuk2JUa8suRbaSVAzXhVRPWPD6y75LGNbTiPUac', {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only',
  defaults: '2025-05-24'
});

// Autocapture records that something was clicked, not what it meant. These two
// are the only outcomes the site exists for: installing the app, and reaching
// a listed provider. Without them there is no way to tell traffic from value.
document.addEventListener('click', function (event) {
  var el = event.target.closest && event.target.closest('a');
  if (!el || typeof posthog === 'undefined') return;

  if (el.dataset.cta === 'install') {
    posthog.capture('install_click', { location: el.closest('section') ? 'app_section' : 'hero' });
    return;
  }

  // Outbound links to a provider's own channel, from a locality or type page.
  if (el.rel && el.rel.indexOf('nofollow') !== -1) {
    posthog.capture('provider_click', {
      provider: el.textContent.trim(),
      page: location.pathname,
    });
  }
});
