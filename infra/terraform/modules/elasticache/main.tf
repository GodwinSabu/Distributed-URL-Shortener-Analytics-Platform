variable "project"            {}
variable "env"                {}
variable "vpc_id"             {}
variable "subnet_ids"         { type = list(string) }
variable "eks_security_group" {}

resource "aws_security_group" "redis" {
  name   = "${var.project}-${var.env}-redis"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.eks_security_group]
  }
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project}-${var.env}-cache-subnet"
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.project}-${var.env}-redis"
  description          = "Redis for ${var.project} ${var.env}"

  node_type            = "cache.t3.micro"
  num_cache_clusters   = 2           # primary + 1 replica
  port                 = 6379

  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  automatic_failover_enabled  = true

  tags = { Name = "${var.project}-${var.env}-redis" }
}

output "endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}
