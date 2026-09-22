package com.fenice.geofieldgps

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom

/** Runtime-only renewal. Never uses the owner's Supabase Auth refresh token. */
object RuntimeSessionRenewal {
 private fun hash(value:String)=java.security.MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString(""){"%02x".format(it)}
 @JvmStatic @Synchronized fun adoptIncoming(context:Context,token:String,user:String,org:String):String {
  val p=context.getSharedPreferences("tracker_prefs",Context.MODE_PRIVATE)
  val current=p.getString("access_token",null)
  val same=p.getString("tracker_user_id",null)==user && p.getString("org_id",null)==org
  if(same && !current.isNullOrBlank() && p.getString("runtime_renewed_access",null)==current &&
    (token==current || p.getString("runtime_enrolled_access_hash",null)==hash(token))) return current
  if(!same || token!=current) p.edit().remove("runtime_refresh_token").remove("runtime_access_expires_at")
    .remove("runtime_renewed_access").remove("runtime_enrolled_access_hash").remove("runtime_renew_retry_at").remove("runtime_renew_request_id").commit()
  return token
 }

 fun renewIfNeeded(context: Context, positionUrl: String): Boolean {
  val prefs=context.getSharedPreferences("tracker_prefs",Context.MODE_PRIVATE)
  val old=prefs.getString("access_token",null) ?: return false
  val user=prefs.getString("tracker_user_id",null) ?: return false
  val org=prefs.getString("org_id",null) ?: return false
  val now=System.currentTimeMillis()
  if(prefs.getLong("runtime_access_expires_at",0)>now+3600000 && prefs.getString("runtime_renewed_access",null)==old) return true
  if(prefs.getLong("runtime_renew_retry_at",0)>now) return false
  val refresh=prefs.getString("runtime_refresh_token",null) ?: ByteArray(32).also{SecureRandom().nextBytes(it)}.joinToString(""){"%02x".format(it)}
  val requestId=prefs.getString("runtime_renew_request_id",null) ?: java.util.UUID.randomUUID().toString()
  // Persist proof before sending: a lost response must remain recoverable after restart.
  if(!prefs.edit().putString("runtime_enrolled_access_hash",prefs.getString("runtime_enrolled_access_hash",null) ?: hash(old)).putString("runtime_refresh_token",refresh).putString("runtime_renew_request_id",requestId).putLong("runtime_renew_retry_at",now+60000).commit()) return false
  var conn:HttpURLConnection?=null
  return try {
   val base=URL(positionUrl)
   require(base.protocol=="https")
   conn=URL(base,"/api/tracker-session-renew").openConnection() as HttpURLConnection
   conn.requestMethod="POST";conn.connectTimeout=15000;conn.readTimeout=15000;conn.doOutput=true
   conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("Authorization","Bearer $old")
   val body=JSONObject().put("refresh_token",refresh).put("org_id",org).put("tracker_user_id",user).put("request_id",requestId)
   conn.outputStream.use{it.write(body.toString().toByteArray())}
   if(conn.responseCode==409) {
    prefs.edit().remove("runtime_renew_request_id").commit()
    return false
   }
   if(conn.responseCode!=200) return false // Keep credentials for retry, never erase on network failure.
   val result=JSONObject(conn.inputStream.bufferedReader().use{it.readText()})
   val token=result.optString("access_token","")
   if(!result.optBoolean("ok")||!token.matches(Regex("[0-9a-f]{64}"))||result.optString("org_id")!=org||result.optString("tracker_user_id")!=user) return false
   // An invitation may have replaced the session while HTTP was in flight.
   if(prefs.getString("access_token",null)!=old||prefs.getString("org_id",null)!=org||prefs.getString("tracker_user_id",null)!=user) return false
   val seconds=result.optLong("expires_in",0)
   if(seconds<=0 || seconds>86400) return false
   prefs.edit().putString("access_token",token).putString("tracker_access_token",token)
    .putString("tracker_runtime_token",token).putString("runtime_renewed_access",token)
    .putLong("runtime_access_expires_at",System.currentTimeMillis()+seconds*1000)
    .putLong("runtime_renew_retry_at",0).remove("runtime_renew_request_id").commit()
  } catch(_:Exception) {false} finally {conn?.disconnect()}
 }
}
