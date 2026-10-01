# Published for anything that needs this environment's site URL - the release smoke tests and this
# repo's own e2e/acceptance runners - so they look it up by environment name rather than reading
# this repository's Terraform state (mootmaker-api#94).
resource "aws_ssm_parameter" "site_url" {
  name        = "/mootmaker/${var.environment}/webapp/site-url"
  description = "Public URL of this environment's webapp."
  type        = "String"
  value       = "https://${local.webapp_domain}"
}
