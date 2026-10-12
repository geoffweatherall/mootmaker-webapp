resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.resource_prefix}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [local.webapp_domain]

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "s3-site"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "s3-site"
    viewer_protocol_policy     = "redirect-to-https"
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6" # AWS managed: CachingOptimized
    response_headers_policy_id = aws_cloudfront_response_headers_policy.site.id
  }

  # This is a SPA: unknown paths (e.g. deep links to client-side routes) should
  # fall back to index.html rather than showing an S3 403/404.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.webapp.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# Security headers on every response (mootmaker-webapp#170). The app keeps Cognito tokens in
# localStorage, so a Content-Security-Policy that lets only this site's own scripts run is the main
# defence if anything ever injects one. A distribution takes one response headers policy, so this
# one carries the usual security headers too, rather than AWS's managed SecurityHeadersPolicy.
#
# What the app talks to, and so what connect-src and img-src allow:
#   - *.mootmaker.com: the API (https), its realtime socket (wss) and the avatar host
#   - *.amazonaws.com: Cognito sign-in, and the presigned S3 URL avatar uploads PUT to
# style-src needs 'unsafe-inline' because MUI injects its styles at run time. Scripts do not.
resource "aws_cloudfront_response_headers_policy" "site" {
  name = "${local.resource_prefix}-security-headers"

  security_headers_config {
    content_security_policy {
      override = true
      content_security_policy = join("; ", [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://*.mootmaker.com",
        "font-src 'self' data:",
        "connect-src 'self' https://*.mootmaker.com wss://*.mootmaker.com https://*.amazonaws.com wss://*.amazonaws.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ])
    }

    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
    }

    content_type_options {
      override = true
    }

    frame_options {
      override     = true
      frame_option = "DENY"
    }

    referrer_policy {
      override        = true
      referrer_policy = "strict-origin-when-cross-origin"
    }
  }
}
