#!/bin/groovy
@Library(['jpm_shared_lib@1.x'])                        // imports the latest stable version of JPM
import org.jnj.*
def args = [:]
args.debug = true                                        // set to true for verbose logs
args.manifestSourcesFile = '_scm_jenkins/manifest-sources.yaml'       // tells JPM where to find job configuration
args.environmentMappingFile = '_scm_jenkins/environment-mapping.yaml'
new pipelines.stdPipeline().execute(args)