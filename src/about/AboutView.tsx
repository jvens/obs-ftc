import React, { useEffect, useState } from 'react';
import { GUIDES, GUIDE_CONTENT } from './guides';

// The About view: what this dashboard is for and how it fits into running an FTC event, for someone
// who knows FTC Live but has never streamed. The overview is one page; the sidebar jumps to its
// sections (#about/<section>) and highlights the one on screen, and lists guides on topics that need
// more detail, each a page of its own (#about/<guide>).

const SECTIONS = [
  { id: 'what', title: 'What this app does' },
  { id: 'fits', title: 'How it fits together' },
  { id: 'needs', title: 'What you need' },
  { id: 'day', title: 'Event day, step by step' },
  { id: 'words', title: 'Words you will see' },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

const sectionElementId = (id: SectionId) => `about-${id}`;

interface Props {
  // The section in the URL (#about/<section>); empty for none.
  sub: string;
  // On screen, so a section link scrolls to its section.
  active: boolean;
}

const Arrow: React.FC = () => (
  <svg className="about-flow-arrow" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 12h15M14 6l6 6-6 6" /></svg>
);

const FlowBox: React.FC<{ where: string; name: string; children: React.ReactNode; highlight?: boolean }> = ({ where, name, children, highlight }) => (
  <div className={`about-flow-box${highlight ? ' highlight' : ''}`}>
    <span className="about-flow-where">{where}</span>
    <strong>{name}</strong>
    <span>{children}</span>
  </div>
);

const AboutView: React.FC<Props> = ({ sub, active }) => {
  const fromUrl = SECTIONS.find(section => section.id === sub)?.id;
  const guide = GUIDES.find(candidate => candidate.id === sub);
  const [current, setCurrent] = useState<SectionId>(fromUrl ?? 'what');

  // A guide opens at its top.
  useEffect(() => {
    if (active && guide) window.scrollTo({ top: 0 });
  }, [active, guide]);

  // A section link (or a bookmark of one) scrolls to its section.
  useEffect(() => {
    if (!active || !fromUrl) return;
    setCurrent(fromUrl);
    document.getElementById(sectionElementId(fromUrl))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [active, fromUrl]);

  // Highlights the section being read as the overview scrolls.
  useEffect(() => {
    if (!active || guide || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      const id = SECTIONS.find(section => sectionElementId(section.id) === visible?.target.id)?.id;
      if (id) setCurrent(id);
    }, { rootMargin: '0px 0px -60% 0px' });
    SECTIONS.forEach(section => {
      const element = document.getElementById(sectionElementId(section.id));
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [active, guide]);

  return (
    <div className="about-layout">
      <nav className="about-toc" aria-label="About pages">
        <div className="about-toc-inner">
          <p className="setup-steps-heading">Overview</p>
          <ol>
            {SECTIONS.map(({ id, title }, index) => (
              <li key={id}>
                <a className="setup-step" href={`#about/${id}`} aria-current={!guide && id === current ? 'location' : undefined}>
                  <span className={`step-marker${!guide && id === current ? ' current' : ''}`} aria-hidden="true">{index + 1}</span>
                  <span className="setup-step-title">{title}</span>
                </a>
              </li>
            ))}
          </ol>
          <hr />
          <p className="setup-steps-heading">Guides</p>
          <ul>
            {GUIDES.map(({ id, title }) => (
              <li key={id}>
                <a className="setup-step" href={`#about/${id}`} aria-current={guide?.id === id ? 'page' : undefined}>
                  <svg className="setup-step-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z" /><path d="M8 9h8M8 13h6" /></svg>
                  <span className="setup-step-title">{title}</span>
                </a>
              </li>
            ))}
          </ul>
          <hr />
          <a className="button-link primary" href="#setup/ftc-live">Start Setup</a>
        </div>
      </nav>

      {guide ? (
        <div className="about-main">
          <article className="about-guide" aria-labelledby="about-guide-title">
            <p className="about-kicker">Guide</p>
            <h2 id="about-guide-title" className="about-title">{guide.title}</h2>
            {React.createElement(GUIDE_CONTENT[guide.id])}
          </article>
          <div className="about-start">
            <span>Back to the big picture, or on to setting up.</span>
            <span className="about-start-links">
              <a className="button-link" href="#about/what">Overview</a>
              <a className="button-link primary" href="#setup/ftc-live">Start Setup</a>
            </span>
          </div>
        </div>
      ) : (
        <div className="about-main">
          <section id={sectionElementId('what')} aria-labelledby="about-what-title">
            <p className="about-kicker">About FTC OBS</p>
            <h2 id="about-what-title" className="about-title">Stream your FTC event, and let the matches run the camera.</h2>
            <p className="about-lead">
              You already run matches in FTC Live. This dashboard connects FTC Live to OBS Studio, free software that streams and
              records video, so the stream follows the event by itself: it shows the field a match is on, puts the FTC Live scores
              on screen, and saves every match.
            </p>
            <div className="about-cards">
              <div className="about-card">
                <strong>Switches scenes for you</strong>
                <span>When FTC Live shows a match, the stream cuts to that field's camera. Nobody has to watch the schedule.</span>
              </div>
              <div className="about-card">
                <strong>Puts FTC Live on screen</strong>
                <span>The same score bar, timer and results as the audience display, on top of your camera.</span>
              </div>
              <div className="about-card">
                <strong>Saves every match</strong>
                <span>A video and screenshots of each match for teams, and chapters so viewers can jump to any match on YouTube.</span>
              </div>
            </div>
          </section>

          <section id={sectionElementId('fits')} aria-labelledby="about-fits-title">
            <h2 id="about-fits-title" className="about-section-title">How it fits together</h2>
            <p className="about-lead">Three programs, each doing one job. FTC Live runs the event as it always does; you do not change anything there.</p>
            <div className="about-flow">
              <FlowBox where="Scoring computer" name="FTC Live">Runs the matches and sends an event for each step: loaded, started, scores posted.</FlowBox>
              <Arrow />
              <FlowBox where="In Chrome, on the OBS computer" name="This dashboard" highlight>Hears those events and tells OBS what to show, record and save.</FlowBox>
              <Arrow />
              <FlowBox where="The streaming computer" name="OBS Studio">Mixes the cameras and the FTC Live overlay into the picture viewers see.</FlowBox>
              <Arrow />
              <FlowBox where="Out to the world" name="YouTube or Twitch">The live stream, plus recordings and screenshots on the OBS computer.</FlowBox>
            </div>
            <p className="about-note">
              <strong>Cameras go into OBS:</strong> a webcam or capture card plugged into the OBS computer, a webcam on another
              computer sent over the network (a <a href="#about/lan-cameras">LAN camera</a>), or a network camera (<a href="#about/ndi">NDI</a>).
            </p>
          </section>

          <section id={sectionElementId('needs')} aria-labelledby="about-needs-title">
            <h2 id="about-needs-title" className="about-section-title">What you need</h2>
            <ul className="about-cards">
              <li className="about-card"><strong>A computer for OBS</strong><span>Windows or Linux, on the same network as FTC Live. Streaming works best on a recent computer with a graphics card.</span></li>
              <li className="about-card"><strong>A camera for each field</strong><span>One camera can cover a field and the awards. Webcams work, even on a cheap laptop or the field display computer (<a href="#about/lan-cameras">how</a>); a capture card lets you use a video camera.</span></li>
              <li className="about-card"><strong>Internet upload</strong><span>The stream sends about 6 Mbps. Aim for at least twice that, and a cable rather than Wi-Fi if you can.</span></li>
              <li className="about-card"><strong>A YouTube or Twitch channel</strong><span>Its stream key goes into OBS once, under Settings, Stream.</span></li>
              <li className="about-card"><strong>Chrome or Edge</strong><span>To open this dashboard on the OBS computer. Firefox cannot reach FTC Live on another computer.</span></li>
              <li className="about-card"><strong>Event audio (optional)</strong><span>A feed from the venue's sound system makes announcements clear. Without one, camera microphones work.</span></li>
            </ul>
          </section>

          <section id={sectionElementId('day')} aria-labelledby="about-day-title">
            <h2 id="about-day-title" className="about-section-title">Event day, step by step</h2>
            <ol className="about-steps">
              <li>
                <span className="step-marker" aria-hidden="true">1</span>
                <span><strong>In the morning, while teams load in: <a href="#setup">Setup</a></strong>
                  Work through the six steps: connect to FTC Live and OBS, build the scenes, pick the cameras and audio, apply the
                  stream settings. Each step ticks off when it is done.</span>
              </li>
              <li>
                <span className="step-marker" aria-hidden="true">2</span>
                <span><strong>Before the first match: go live in OBS</strong>
                  Click Start Streaming in OBS. The dashboard never starts the stream on its own.</span>
              </li>
              <li>
                <span className="step-marker" aria-hidden="true">3</span>
                <span><strong>During matches: <a href="#run">Run</a></strong>
                  Mostly hands-off: scenes switch as FTC Live runs matches. Click Ceremony or Alliance Selection for awards; the
                  next match switches back by itself. Show lower thirds for speakers.</span>
              </li>
              <li>
                <span className="step-marker" aria-hidden="true">4</span>
                <span><strong>Afterwards: <a href="#outputs">Outputs</a> and <a href="#matches">Matches</a></strong>
                  Copy the YouTube chapters into the video's description, and upload each match's video for the teams
                  (<a href="#about/match-videos">how</a>).</span>
              </li>
            </ol>
          </section>

          <section id={sectionElementId('words')} aria-labelledby="about-words-title">
            <h2 id="about-words-title" className="about-section-title">Words you will see</h2>
            <dl className="about-words">
              <dt>OBS Studio</dt><dd>Free software that streams and records. This dashboard sets it up and controls it.</dd>
              <dt>Scene</dt><dd>One layout of the picture, such as Field 1: a camera with the FTC Live overlay on top. The stream shows one scene at a time.</dd>
              <dt>Overlay</dt><dd>FTC Live's score bar and graphics, drawn over the camera.</dd>
              <dt>Stream key</dt><dd>The password-like code from YouTube or Twitch that tells them the stream is yours.</dd>
              <dt>Replay buffer</dt><dd>OBS keeping the last few minutes in memory, so each match can be saved after it ends.</dd>
              <dt>Lower third</dt><dd>A name and title across the bottom of the screen, for a speaker or an award.</dd>
            </dl>
          </section>

          <div className="about-start">
            <span>Ready? Setup takes you through it one step at a time.</span>
            <a className="button-link primary" href="#setup/ftc-live">Start Setup</a>
          </div>
        </div>
      )}
    </div>
  );
};

export default AboutView;
