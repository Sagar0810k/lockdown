package expo.modules.lockdown

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/**
 * Full-screen lock shown over blocked apps. Back button is swallowed.
 * Normal strict level: 3s hold to quit. Strict: 10s hold, everything else locked.
 */
class BlockActivity : Activity() {

  private val handler = Handler(Looper.getMainLooper())
  private lateinit var countdown: TextView
  private lateinit var attemptsView: TextView
  private lateinit var holdLabel: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (!SessionStore.isActive(this)) {
      finish()
      return
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    setContentView(buildLayout())
    tick()
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  override fun onBackPressed() {
    // Intentionally swallowed — going back re-enters the blocked app otherwise.
  }

  private fun blockedLabel(): String {
    val pkg = intent.getStringExtra(LockdownAccessibilityService.EXTRA_BLOCKED_PKG) ?: return "A blocked app"
    return try {
      packageManager.getApplicationInfo(pkg, 0).let { packageManager.getApplicationLabel(it).toString() }
    } catch (e: Exception) {
      pkg
    }
  }

  private fun buildLayout(): View {
    val ink = Color.parseColor("#E7EAF5")
    val muted = Color.parseColor("#8A93B2")
    val amber = Color.parseColor("#F5B942")
    val surface = Color.parseColor("#141B34")

    val scroll = android.widget.ScrollView(this).apply {
      setBackgroundColor(Color.parseColor("#0B1020"))
      isFillViewport = true
    }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(28), dp(48), dp(28), dp(28))
    }

    val tag = TextView(this).apply {
      text = "FOCUS LOCK"
      setTextColor(amber)
      textSize = 13f
      typeface = Typeface.DEFAULT_BOLD
      letterSpacing = 0.35f
    }

    countdown = TextView(this).apply {
      setTextColor(amber)
      textSize = 84f
      typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
      gravity = Gravity.CENTER
    }

    val sub = TextView(this).apply {
      text = "remaining in this session"
      setTextColor(muted)
      textSize = 14f
    }

    val appRow = TextView(this).apply {
      text = blockedLabel() + " is locked"
      setTextColor(ink)
      textSize = 20f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(dp(20), dp(12), dp(20), dp(12))
      background = rounded(surface, dp(16))
    }

    attemptsView = TextView(this).apply {
      setTextColor(muted)
      textSize = 13f
      setPadding(0, dp(14), 0, 0)
    }

    val home = Button(this).apply {
      text = "BACK TO STUDY"
      setTextColor(Color.parseColor("#0B1020"))
      setTypeface(Typeface.DEFAULT_BOLD)
      background = rounded(amber, dp(16))
      setPadding(dp(36), dp(16), dp(36), dp(16))
      setOnClickListener { goHome() }
    }

    val isStrict = SessionStore.isStrict(this)
    val holdMs = if (isStrict) 10_000 else 3_000

    val holdTitle = TextView(this).apply {
      text = if (isStrict) "Strict mode — hold to break the session" else "End session early"
      setTextColor(muted)
      textSize = 12f
      setPadding(0, dp(26), 0, dp(4))
    }

    val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
      max = holdMs
      progress = 0
      setProgressTintList(android.content.res.ColorStateList.valueOf(amber))
      setTrackTintList(android.content.res.ColorStateList.valueOf(Color.parseColor("#232B4A")))
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(8))
    }

    holdLabel = TextView(this).apply {
      text = "HOLD ${holdMs / 1000}s TO END"
      setTextColor(Color.parseColor("#FF6B6B"))
      typeface = Typeface.DEFAULT_BOLD
      textSize = 15f
      setPadding(dp(32), dp(14), dp(32), dp(14))
      background = rounded(Color.TRANSPARENT, dp(14))
      gravity = Gravity.CENTER
    }

    var holding = false
    var held = 0L
    val holdHandler = Handler(Looper.getMainLooper())
    val step = Runnable {
      if (!holding) return@Runnable
      held += 50
      progress.progress = held.toInt()
      if (held >= holdMs) {
        holding = false
        SessionStore.endSession(this, if (isStrict) "emergency" else "quit")
        goHome()
      } else {
        holdHandler.postDelayed(this, 50)
      }
    }
    holdLabel.setOnTouchListener { _, event ->
      when (event.action) {
        android.view.MotionEvent.ACTION_DOWN -> {
          holding = true
          held = 0
          holdHandler.postDelayed(step, 50)
          true
        }
        android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
          holding = false
          held = 0
          progress.progress = 0
          holdHandler.removeCallbacks(step)
          true
        }
        else -> true
      }
    }

    val warning = TextView(this).apply {
      text = if (isStrict) "Settings & installer are blocked until the timer ends" else "Ending early is logged to your streak"
      setTextColor(Color.parseColor("#5B6488"))
      textSize = 11f
      setPadding(0, dp(8), 0, 0)
    }

    root.apply {
      addView(tag)
      addView(countdown, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(56) })
      addView(sub)
      addView(appRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(48) })
      addView(attemptsView)
      addView(home, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(36) })
      addView(holdTitle)
      addView(progress)
      addView(holdLabel, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) })
      addView(warning)
    }

    scroll.addView(root)
    return scroll
  }

  private fun tick() {
    if (!SessionStore.isActive(this)) { finish(); goHome(); return }
    val remaining = SessionStore.remainingSeconds(this)
    countdown.text = String.format("%02d:%02d", remaining / 60, remaining % 60)
    attemptsView.text = "Blocked-app attempts this session: ${SessionStore.totalAttempts(this)}"
    if (remaining <= 0) {
      SessionStore.maybeExpire(this)
      goHome()
      return
    }
    handler.postDelayed({ tick() }, 500)
  }

  private fun goHome() {
    startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    })
    finish()
  }

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  private fun rounded(color: Int, radius: Int): GradientDrawable = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radius.toFloat()
  }
}
