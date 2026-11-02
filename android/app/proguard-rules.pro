# Retrofit inspects service interfaces and generic signatures at runtime.
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keep interface com.anthonyaya.platypus.data.remote.PlatypusApi { *; }

# Gson reflects over API DTO fields, including fields that do not use @SerializedName.
-keep class com.anthonyaya.platypus.data.model.** { *; }
