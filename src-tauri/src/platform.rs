//! Platform-specific functionality

#[cfg(target_os = "macos")]
mod macos {
    use objc2::rc::Retained;
    use objc2::runtime::{NSObjectProtocol, ProtocolObject};
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
    use std::sync::Mutex;

    /// Opaque handle to an NSProcessInfo activity (retained for as long as we hold it)
    pub struct ActivityToken(Retained<ProtocolObject<dyn NSObjectProtocol>>);

    // The token is only ever touched while holding the MINING_ACTIVITY mutex,
    // and NSProcessInfo activities may be ended from any thread.
    unsafe impl Send for ActivityToken {}

    /// Global storage for the activity token
    static MINING_ACTIVITY: Mutex<Option<ActivityToken>> = Mutex::new(None);

    /// Begin App Nap prevention for mining.
    ///
    /// UserInitiated prevents idle system sleep (keeps mining on the lock screen).
    /// Lid close still sleeps the Mac. Not UserInitiatedAllowingIdleSystemSleep: that
    /// variant lets an idle, locked Mac sleep, which stops mining outright. Since
    /// macOS 27 the activity no longer exempts a minimized app from App Nap; the
    /// bundle opts out with `LSAppNapIsDisabled` in Info.plist instead.
    pub fn begin_mining_activity() {
        let mut guard = MINING_ACTIVITY.lock().unwrap();

        // Already active
        if guard.is_some() {
            return;
        }

        let process_info = NSProcessInfo::processInfo();
        let reason = NSString::from_str("Mining cryptocurrency");

        let activity =
            process_info.beginActivityWithOptions_reason(NSActivityOptions::UserInitiated, &reason);

        *guard = Some(ActivityToken(activity));
        log::info!("macOS App Nap prevention enabled for mining");
    }

    /// End App Nap prevention
    pub fn end_mining_activity() {
        let mut guard = MINING_ACTIVITY.lock().unwrap();

        if let Some(token) = guard.take() {
            unsafe {
                NSProcessInfo::processInfo().endActivity(&token.0);
            }
            log::info!("macOS App Nap prevention disabled");
        }
    }
}

#[cfg(target_os = "macos")]
pub use macos::{begin_mining_activity, end_mining_activity};

#[cfg(not(target_os = "macos"))]
pub fn begin_mining_activity() {}

#[cfg(not(target_os = "macos"))]
pub fn end_mining_activity() {}
